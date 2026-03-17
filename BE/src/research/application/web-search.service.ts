import { Injectable } from '@nestjs/common';
import { SearchSources, SearchStreamEvent } from '../domain/model/search-sources.model';
import { WebSearchProvider } from '../infrastructure/web-search.provider';
import { SearchEngine } from '../domain/model/search-planner.model';

@Injectable()
export class WebSearchService {
  constructor(private readonly webSearchProvider: WebSearchProvider) {}

  hasExternalSearch(): boolean {
    return this.webSearchProvider.hasExternalSearch();
  }

  async runSearch(prompt: string): Promise<{ sources: SearchSources; context: string }> {
    if (!this.hasExternalSearch()) {
      return { sources: {}, context: '' };
    }
    const { combined, sources } = await this.webSearchProvider.searchAll(prompt);
    return { sources, context: combined };
  }

  async *runSearchStream(query: string): AsyncGenerator<SearchStreamEvent> {
    if (!this.hasExternalSearch()) {
      yield { type: 'done', sources: {}, context: '' };
      return;
    }
    yield* this.webSearchProvider.searchAllStream(query);
  }

  async testSearchEngine(engine: 'tavily' | 'serper' | 'naver' | 'brave', query: string) {
    return { result: await this.webSearchProvider.searchSingle(engine, query) };
  }

  async searchByEngine(engine: SearchEngine, query: string): Promise<string> {
    return this.webSearchProvider.searchSingle(engine, query);
  }

  async testOllamaFilter(query: string, context: string, customFilterPrompt?: string) {
    const result = await this.webSearchProvider.filterWithOllama(query, context, customFilterPrompt);
    return { result };
  }
}
