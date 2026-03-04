import { Injectable } from '@nestjs/common';
import { PROMPTS } from '../../research/domain/prompt/research.prompts';
import { makeCache } from '../../research/infrastructure/cache/ttl-cache';
import { fetchTavilyUsage } from '../infrastructure/tavily.client';
import { fetchAnthropicUsageReport } from '../infrastructure/anthropic.client';

@Injectable()
export class OverviewService {
  private tavilyCache = makeCache<Awaited<ReturnType<OverviewService['getTavilyOverview']>>>();
  private anthropicCache = makeCache<Awaited<ReturnType<OverviewService['getAnthropicUsage']>>>();

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
