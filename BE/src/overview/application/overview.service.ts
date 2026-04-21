import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { LIGHT_RESEARCH_PROMPTS } from '../../research/domain/prompt/research.prompts';
import { makeCache } from '../../research/infrastructure/cache/ttl-cache';
import { fetchTavilyUsage } from '../infrastructure/tavily.client';
import { fetchAnthropicUsageReport } from '../infrastructure/anthropic.client';
import { ApiKeyRepository } from '../domain/repository/api-key.repository';
import { TokenHistoryRepository } from '../domain/repository/token-history.repository';
import { ApiKeyResponseDto } from '../presentation/dto/response/api-key.response.dto';
import { isEnvKeySet } from '../../shared/env/env.utils';
import { MODELS } from '../../ai/domain/models';

const ALLOWED_KEYS = [
  'ANTHROPIC_ADMIN_API_KEY',
  'GOOGLE_API_KEY',
  'TAVILY_API_KEY',
  'SERPER_API_KEY',
  'NAVER_CLIENT_ID',
  'BRAVE_API_KEY',
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

const KEY_LABELS: Record<AllowedKey, string> = {
  ANTHROPIC_ADMIN_API_KEY: 'Anthropic Admin',
  GOOGLE_API_KEY: 'Google (Default)',
  TAVILY_API_KEY: 'Tavily',
  SERPER_API_KEY: 'Serper',
  NAVER_CLIENT_ID: 'Naver',
  BRAVE_API_KEY: 'Brave',
};

@Injectable()
export class OverviewService {
  private readonly envPath = path.resolve(process.cwd(), '.env');
  private tavilyCache = makeCache<Awaited<ReturnType<OverviewService['getTavilyOverview']>>>();
  private anthropicCache = makeCache<Awaited<ReturnType<OverviewService['getAnthropicUsage']>>>();

  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly tokenHistoryRepository: TokenHistoryRepository,
  ) {}

  private maskKey(value: string | undefined): string | null {
    if (!value || !isEnvKeySet(value)) return null;
    if (value.length <= 8) return value.slice(0, 2) + '****';
    return value.slice(0, 10) + '*'.repeat(Math.min(value.length - 10, 20)) + value.slice(-4);
  }

  getApiKeys() {
    return ALLOWED_KEYS.map((key) => ({
      key,
      label: KEY_LABELS[key],
      masked: this.maskKey(process.env[key]),
      configured: isEnvKeySet(process.env[key]),
    }));
  }

  updateApiKey(key: string, value: string) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      throw new BadRequestException('허용되지 않은 키입니다.');
    }

    let content = '';
    try {
      content = fs.readFileSync(this.envPath, 'utf-8');
    } catch {
      // .env 없으면 새로 생성
    }

    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }

    fs.writeFileSync(this.envPath, content, 'utf-8');
    process.env[key] = value;

    // 관련 캐시 무효화
    this.tavilyCache.invalidate();
    this.anthropicCache.invalidate();

    return { ok: true };
  }

  getPromptTemplates() {
    return {
      lightResearchCloud: LIGHT_RESEARCH_PROMPTS.taskList('{{topic}}', '{{searchContext}}'),
      system: LIGHT_RESEARCH_PROMPTS.system,
      ollamaFilter: LIGHT_RESEARCH_PROMPTS.ollamaFilter('{{query}}', '{{context}}'),
    };
  }

  getPipelineStatus() {
    const isSet = isEnvKeySet;
    return {
      tavily: isSet(process.env.TAVILY_API_KEY),
      serper: isSet(process.env.SERPER_API_KEY),
      naver: isSet(process.env.NAVER_CLIENT_ID),
      brave: isSet(process.env.BRAVE_API_KEY),
      ollama: true,
    };
  }

  async getTavilyOverview() {
    const cached = this.tavilyCache.get();
    if (cached) return cached;

    const apiKey = process.env.TAVILY_API_KEY;
    if (!isEnvKeySet(apiKey)) {
      return { configured: false, usage: null, apiKey: null };
    }

    const usage = await fetchTavilyUsage(apiKey);

    const masked =
      apiKey.length > 12
        ? apiKey.slice(0, 12) + '*'.repeat(apiKey.length - 12)
        : apiKey.slice(0, 4) + '****';

    const result = { configured: true, usage, apiKey: masked };
    this.tavilyCache.set(result);
    return result;
  }

  async getAnthropicUsage() {
    const cached = this.anthropicCache.get();
    if (cached) return cached;

    const adminKey = process.env.ANTHROPIC_ADMIN_API_KEY;
    if (!adminKey || adminKey.startsWith('your_')) {
      return { configured: false, data: null };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startingAt = startOfMonth.toISOString();
    const endingAt = now.toISOString();

    try {
      const response = await fetchAnthropicUsageReport(adminKey, startingAt, endingAt);

      if (!response.ok) {
        return { configured: true, data: null, error: response.error };
      }

      const totals = (response.data.data ?? []).reduce(
        (acc: any, bucket: any) => {
          acc.input_tokens += bucket.input_tokens ?? 0;
          acc.output_tokens += bucket.output_tokens ?? 0;
          acc.cache_read_input_tokens += bucket.cache_read_input_tokens ?? 0;
          acc.cache_creation_input_tokens += bucket.cache_creation_input_tokens ?? 0;
          return acc;
        },
        { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      );

      const result = {
        configured: true,
        data: {
          period: { from: startingAt, to: endingAt },
          totals,
          daily: response.data.data ?? [],
        },
      };
      this.anthropicCache.set(result);
      return result;
    } catch (e: any) {
      return { configured: true, data: null, error: e.message };
    }
  }

  // ******* //
  // API Key //
  // ******* //
  async getStoredApiKeys(): Promise<ApiKeyResponseDto[]> {
    const keys = await this.apiKeyRepository.findAll();
    return keys.map(ApiKeyResponseDto.from);
  }

  async getStoredApiKey(id: string): Promise<ApiKeyResponseDto> {
    const k = await this.apiKeyRepository.findById(id);
    if (!k) throw new NotFoundException(`API 키를 찾을 수 없습니다: ${id}`);
    return ApiKeyResponseDto.from(k);
  }

  async createStoredApiKey(apiName: string, key: string): Promise<ApiKeyResponseDto> {
    const entity = await this.apiKeyRepository.save({ id: randomUUID(), apiName, key });
    return ApiKeyResponseDto.from(entity);
  }

  async updateStoredApiKey(id: string, apiName?: string, key?: string): Promise<ApiKeyResponseDto> {
    const existing = await this.apiKeyRepository.findById(id);
    if (!existing) throw new NotFoundException(`API 키를 찾을 수 없습니다: ${id}`);
    const updated = await this.apiKeyRepository.update(id, { ...(apiName && { apiName }), ...(key && { key }) });
    return ApiKeyResponseDto.from(updated);
  }

  async deleteStoredApiKey(id: string) {
    const existing = await this.apiKeyRepository.findById(id);
    if (!existing) throw new NotFoundException(`API 키를 찾을 수 없습니다: ${id}`);
    await this.apiKeyRepository.delete(id);
    return { ok: true };
  }

  // ******** //
  // Logs     //
  // ******** //
  async getLogs(page: number, limit: number) {
    const { data, total } = await this.tokenHistoryRepository.findPaginated(page, limit);
    const modelNameMap = new Map<string, string>(MODELS.map((m) => [m.id, m.name]));

    const logs = data.map((entry) => {
      const tokens = entry.usedTokens ?? '';
      const inputMatch = tokens.match(/input:(\d+)/);
      const outputMatch = tokens.match(/output:(\d+)/);
      return {
        id: entry.id,
        createdAt: entry.createdAt,
        model: modelNameMap.get(entry.aiModel) ?? entry.aiModel,
        modelId: entry.aiModel,
        inputTokens: inputMatch ? parseInt(inputMatch[1], 10) : 0,
        outputTokens: outputMatch ? parseInt(outputMatch[1], 10) : 0,
        estimatedFees: entry.estimatedFees,
      };
    });

    return { data: logs, total, page, limit };
  }

  // *********** //
  // Analytics   //
  // *********** //
  async getAnalytics(range: string, granularity = '1d') {
    const all = await this.tokenHistoryRepository.findAll();

    const now = new Date();
    let cutoff: Date | null = null;
    if (range === '7d') {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === '90d') {
      cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const filtered = cutoff ? all.filter((e) => new Date(e.createdAt) >= cutoff!) : all;

    // model id → display name
    const modelNameMap = new Map<string, string>(MODELS.map((m) => [m.id, m.name]));

    const getKey = (createdAt: Date): string => {
      const d = new Date(createdAt);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      if (granularity === '1h') {
        const hh = String(d.getHours()).padStart(2, '0');
        return `${mm}/${dd} ${hh}:00`;
      }
      if (granularity === '4h') {
        const hh = String(Math.floor(d.getHours() / 4) * 4).padStart(2, '0');
        return `${mm}/${dd} ${hh}:00`;
      }
      return `${mm}/${dd}`;
    };

    // Group by key + model
    const byDateModel = new Map<string, Map<string, number>>();
    const modelSet = new Set<string>();
    let totalCost = 0;

    for (const entry of filtered) {
      const key = getKey(new Date(entry.createdAt));
      const modelName = modelNameMap.get(entry.aiModel) ?? entry.aiModel;
      modelSet.add(modelName);
      totalCost += entry.estimatedFees ?? 0;

      if (!byDateModel.has(key)) byDateModel.set(key, new Map());
      const dateMap = byDateModel.get(key)!;
      dateMap.set(modelName, (dateMap.get(modelName) ?? 0) + (entry.estimatedFees ?? 0));
    }

    // Build sorted chart data
    const sortedDates = Array.from(byDateModel.keys()).sort();
    const chartData = sortedDates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const [model, cost] of byDateModel.get(date)!) {
        row[model] = Math.round(cost * 1_000_000) / 1_000_000;
      }
      return row;
    });

    // byModel summary
    const byModel: Record<string, { cost: number; calls: number }> = {};
    for (const entry of filtered) {
      const modelName = modelNameMap.get(entry.aiModel) ?? entry.aiModel;
      if (!byModel[modelName]) byModel[modelName] = { cost: 0, calls: 0 };
      byModel[modelName].cost += entry.estimatedFees ?? 0;
      byModel[modelName].calls += 1;
    }

    return {
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      totalCalls: filtered.length,
      chartData,
      models: Array.from(modelSet),
      byModel,
    };
  }
}
