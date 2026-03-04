import { Injectable } from '@nestjs/common';
import { SearchSources, SearchStreamEvent } from '../domain/model/search-sources.model';
import { searchTavily } from '../infrastructure/search/tavily.search';
import { searchSerper } from '../infrastructure/search/serper.search';
import { searchNaver } from '../infrastructure/search/naver.search';
import { searchBrave } from '../infrastructure/search/brave.search';
import { filterWithOllama } from '../infrastructure/search/ollama-filter.search';

@Injectable()
export class WebSearchService {
  hasExternalSearch(): boolean {
    return [
      process.env.TAVILY_API_KEY,
      process.env.SERPER_API_KEY,
      process.env.NAVER_CLIENT_ID,
      process.env.BRAVE_API_KEY,
    ].some((k) => k && !k.startsWith('your_'));
  }

  async runSearch(prompt: string): Promise<{ sources: SearchSources; context: string }> {
    if (!this.hasExternalSearch()) {
      return { sources: {}, context: '' };
    }
    const { combined, sources } = await this.runSearchPipeline(prompt);
    return { sources, context: combined };
  }

  async *runSearchStream(query: string): AsyncGenerator<SearchStreamEvent> {
    if (!this.hasExternalSearch()) {
      yield { type: 'done', sources: {}, context: '' };
      return;
    }

    const tasks: { key: keyof SearchSources; fn: () => Promise<string> }[] = [];
    if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
      tasks.push({ key: 'tavily', fn: () => searchTavily(query) });
    }
    if (process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.startsWith('your_')) {
      tasks.push({ key: 'serper', fn: () => searchSerper(query) });
    }
    if (process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_ID.startsWith('your_')) {
      tasks.push({ key: 'naver', fn: () => searchNaver(query) });
    }
    if (process.env.BRAVE_API_KEY && !process.env.BRAVE_API_KEY.startsWith('your_')) {
      tasks.push({ key: 'brave', fn: () => searchBrave(query) });
    }

    if (tasks.length === 0) {
      yield { type: 'done', sources: {}, context: '' };
      return;
    }

    const queue: SearchStreamEvent[] = [];
    let waiter: (() => void) | null = null;
    const emit = (event: SearchStreamEvent) => {
      queue.push(event);
      if (waiter) { const w = waiter; waiter = null; w(); }
    };

    const sources: SearchSources = {};
    const parts: string[] = [];
    let completed = 0;

    for (const { key, fn } of tasks) {
      fn()
        .then((result) => {
          if (result) {
            sources[key] = result;
            parts.push(result);
            emit({ type: 'source', key, result });
          }
        })
        .catch(() => {})
        .finally(() => {
          completed++;
          if (completed === tasks.length) {
            emit({ type: 'done', sources, context: parts.join('\n\n---\n\n') });
          }
        });
    }

    while (true) {
      while (queue.length > 0) {
        const event = queue.shift()!;
        yield event;
        if (event.type === 'done') return;
      }
      await new Promise<void>((resolve) => { waiter = resolve; });
    }
  }

  async testSearchEngine(engine: 'tavily' | 'serper' | 'naver' | 'brave', query: string) {
    switch (engine) {
      case 'tavily': return { result: await searchTavily(query) };
      case 'serper': return { result: await searchSerper(query) };
      case 'naver': return { result: await searchNaver(query) };
      case 'brave': return { result: await searchBrave(query) };
    }
  }

  async testOllamaFilter(query: string, context: string, customFilterPrompt?: string) {
    const result = await filterWithOllama(query, context, customFilterPrompt);
    return { result };
  }

  private async runSearchPipeline(query: string): Promise<{ combined: string; sources: SearchSources }> {
    const pending: { key: keyof SearchSources; promise: Promise<string> }[] = [];

    if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
      pending.push({ key: 'tavily', promise: searchTavily(query) });
    }
    if (process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.startsWith('your_')) {
      pending.push({ key: 'serper', promise: searchSerper(query) });
    }
    if (process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_ID.startsWith('your_')) {
      pending.push({ key: 'naver', promise: searchNaver(query) });
    }
    if (process.env.BRAVE_API_KEY && !process.env.BRAVE_API_KEY.startsWith('your_')) {
      pending.push({ key: 'brave', promise: searchBrave(query) });
    }

    const results = await Promise.allSettled(pending.map((p) => p.promise));
    const sources: SearchSources = {};
    const parts: string[] = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        sources[pending[i].key] = result.value;
        parts.push(result.value);
      }
    });

    return { combined: parts.join('\n\n---\n\n'), sources };
  }
}
