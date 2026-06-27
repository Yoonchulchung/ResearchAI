import { Injectable } from '@nestjs/common';
import {
  SearchSources,
  SearchStreamEvent,
} from 'src/research/domain/model/search-sources.model';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';
import { WebSearchImplService } from 'src/research/application/web-search/web-search-impl.service';

@Injectable()
export class WebSearchService {
  constructor(private readonly impl: WebSearchImplService) {}

  hasExternalSearch(): boolean {
    return this.impl.hasExternalSearch();
  }

  runSearch(
    prompt: string,
  ): Promise<{ sources: SearchSources; context: string }> {
    return this.impl.runSearch(prompt);
  }

  runSearchStream(query: string): AsyncGenerator<SearchStreamEvent> {
    return this.impl.runSearchStream(query);
  }

  getAvailableEngines(): { id: string; name: string; builtin: boolean }[] {
    return this.impl.getAvailableEngines();
  }

  testSearchEngine(
    engine: 'tavily' | 'serper' | 'naver' | 'brave',
    query: string,
  ) {
    return this.impl.testSearchEngine(engine, query);
  }

  searchRaw(engine: SearchEngine, query: string): Promise<string> {
    return this.impl.searchRaw(engine, query);
  }

  searchByEngine(
    engine: SearchEngine,
    query: string,
    filterModel?: string,
  ): Promise<string> {
    return this.impl.searchByEngine(engine, query, filterModel);
  }
}
