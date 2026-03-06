import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PROMPTS } from '../../research/domain/prompt/research.prompts';
import { makeCache } from '../../research/infrastructure/cache/ttl-cache';
import { fetchTavilyUsage } from '../infrastructure/tavily.client';
import { fetchAnthropicUsageReport } from '../infrastructure/anthropic.client';

const ALLOWED_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_ADMIN_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'TAVILY_API_KEY',
  'SERPER_API_KEY',
  'NAVER_CLIENT_ID',
  'BRAVE_API_KEY',
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

const KEY_LABELS: Record<AllowedKey, string> = {
  ANTHROPIC_API_KEY: 'Anthropic',
  ANTHROPIC_ADMIN_API_KEY: 'Anthropic Admin',
  OPENAI_API_KEY: 'OpenAI',
  GOOGLE_API_KEY: 'Google',
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

  private maskKey(value: string | undefined): string | null {
    if (!value || value.startsWith('your_')) return null;
    if (value.length <= 8) return value.slice(0, 2) + '****';
    return value.slice(0, 10) + '*'.repeat(Math.min(value.length - 10, 20)) + value.slice(-4);
  }

  getApiKeys() {
    return ALLOWED_KEYS.map((key) => ({
      key,
      label: KEY_LABELS[key],
      masked: this.maskKey(process.env[key]),
      configured: !!(process.env[key] && !process.env[key]!.startsWith('your_')),
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
      generateTasks: PROMPTS.generateTasks('{{topic}}', '{{searchContext}}'),
      system: PROMPTS.system,
      ollamaFilter: PROMPTS.ollamaFilter('{{query}}', '{{context}}'),
    };
  }

  getPipelineStatus() {
    const isSet = (key: string | undefined) => !!(key && !key.startsWith('your_'));
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
    if (!apiKey || apiKey.startsWith('your_')) {
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
}
