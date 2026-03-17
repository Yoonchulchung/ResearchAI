import { Injectable } from '@nestjs/common';
import { SearchSources, SearchStreamEvent } from '../domain/model/search-sources.model';
import { searchTavily } from './search/tavily.search';
import { searchSerper } from './search/serper.search';
import { searchNaver } from './search/naver.search';
import { searchBrave } from './search/brave.search';
import { searchDuckDuckGo } from './search/duckduckgo.search';


@Injectable()
export class WebSearchProvider {
  hasExternalSearch(): boolean {
    return true; // DuckDuckGo는 항상 사용 가능
  }

  getAvailableTasks(query: string): { key: keyof SearchSources; fn: () => Promise<string> }[] {
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
    // API 키 불필요 — 항상 포함
    tasks.push({ key: 'duckduckgo', fn: () => searchDuckDuckGo(query) });
    return tasks;
  }

  async searchAll(query: string): Promise<{ combined: string; sources: SearchSources }> {
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

  async searchSingle(engine: string, query: string): Promise<string> {
    switch (engine) {
      case 'tavily':      return searchTavily(query);
      case 'serper':      return searchSerper(query);
      case 'naver':       return searchNaver(query);
      case 'brave':       return searchBrave(query);
      case 'duckduckgo':  return searchDuckDuckGo(query);
      default: return '';
    }
  }

}
