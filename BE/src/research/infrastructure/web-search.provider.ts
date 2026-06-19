import { Injectable, Logger } from '@nestjs/common';
import {
  SearchSources,
  SearchStreamEvent,
} from 'src/research/domain/model/search-sources.model';
import { searchTavily } from 'src/research/infrastructure/search/tavily.search';
import { searchSerper } from 'src/research/infrastructure/search/serper.search';
import { searchNaver } from 'src/research/infrastructure/search/naver.search';
import { searchBrave } from 'src/research/infrastructure/search/brave.search';
import { searchDuckDuckGo } from 'src/research/infrastructure/search/duckduckgo.search';

@Injectable()
export class WebSearchProvider {
  private readonly logger = new Logger(WebSearchProvider.name);

  hasExternalSearch(): boolean {
    return true; // DuckDuckGo는 항상 사용 가능
  }

  getAvailableTasks(
    query: string,
  ): { key: keyof SearchSources; fn: () => Promise<string> }[] {
    const tasks: { key: keyof SearchSources; fn: () => Promise<string> }[] = [];
    // API 키 불필요 — 기본 검색 엔진으로 우선 사용
    tasks.push({ key: 'duckduckgo', fn: () => searchDuckDuckGo(query) });
    if (
      process.env.TAVILY_API_KEY &&
      !process.env.TAVILY_API_KEY.startsWith('your_')
    ) {
      tasks.push({ key: 'tavily', fn: () => searchTavily(query) });
    }
    if (
      process.env.SERPER_API_KEY &&
      !process.env.SERPER_API_KEY.startsWith('your_')
    ) {
      tasks.push({ key: 'serper', fn: () => searchSerper(query) });
    }
    if (
      process.env.NAVER_CLIENT_ID &&
      !process.env.NAVER_CLIENT_ID.startsWith('your_')
    ) {
      tasks.push({ key: 'naver', fn: () => searchNaver(query) });
    }
    if (
      process.env.BRAVE_API_KEY &&
      !process.env.BRAVE_API_KEY.startsWith('your_')
    ) {
      tasks.push({ key: 'brave', fn: () => searchBrave(query) });
    }
    return tasks;
  }

  async searchAll(
    query: string,
  ): Promise<{ combined: string; sources: SearchSources }> {
    const tasks = this.getAvailableTasks(query);
    const results = await Promise.allSettled(tasks.map((t) => t.fn()));
    const sources: SearchSources = {};
    const parts: string[] = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        sources[tasks[i].key] = result.value;
        parts.push(result.value);
      }
    });

    return { combined: parts.join('\n\n---\n\n'), sources };
  }

  async *searchAllStream(query: string): AsyncGenerator<SearchStreamEvent> {
    const tasks = this.getAvailableTasks(query);

    if (tasks.length === 0) {
      yield { type: 'done', sources: {}, context: '' };
      return;
    }

    const queue: SearchStreamEvent[] = [];
    let waiter: (() => void) | null = null;
    const emit = (event: SearchStreamEvent) => {
      queue.push(event);
      if (waiter) {
        const w = waiter;
        waiter = null;
        w();
      }
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
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }
  }

  async searchSingle(engine: string, query: string): Promise<string> {
    this.logger.log(`engine=${engine} | query="${query}"`);
    switch (engine) {
      case 'tavily':
        return searchTavily(query);
      case 'serper':
        return searchSerper(query);
      case 'naver':
        return searchNaver(query);
      case 'brave':
        return searchBrave(query);
      case 'duckduckgo':
        return searchDuckDuckGo(query);
      default:
        return '';
    }
  }
}
