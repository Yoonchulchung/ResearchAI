import { Injectable } from '@nestjs/common';
import { SearchSources, SearchStreamEvent } from '../domain/model/search-sources.model';
import { WebSearchProvider } from '../infrastructure/web-search.provider';
import { SearchEngine, isBuiltinSearchEngine } from '../domain/model/search-planner.model';
import { AiService } from '../../ai/application/ai.service';

@Injectable()
export class WebSearchService {
  private static readonly FILTER_MODEL = 'ollama:llama3.1';

  constructor(
    private readonly webSearchProvider: WebSearchProvider,
    private readonly aiService: AiService,
  ) {}

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

  getAvailableEngines(): { id: string; name: string; builtin: boolean }[] {
    const engines: { id: string; name: string; builtin: boolean }[] = [
      { id: SearchEngine.ANTHROPIC_BUILTIN, name: 'Anthropic 내장', builtin: true },
      { id: SearchEngine.GOOGLE_BUILTIN,    name: 'Google 내장',    builtin: true },
      { id: SearchEngine.DUCKDUCKGO,        name: 'DuckDuckGo',     builtin: false },
    ];
    if (process.env.TAVILY_API_KEY  && !process.env.TAVILY_API_KEY.startsWith('your_'))
      engines.push({ id: SearchEngine.TAVILY, name: 'Tavily', builtin: false });
    if (process.env.SERPER_API_KEY  && !process.env.SERPER_API_KEY.startsWith('your_'))
      engines.push({ id: SearchEngine.SERPER, name: 'Serper', builtin: false });
    if (process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_ID.startsWith('your_'))
      engines.push({ id: SearchEngine.NAVER, name: 'Naver', builtin: false });
    if (process.env.BRAVE_API_KEY   && !process.env.BRAVE_API_KEY.startsWith('your_'))
      engines.push({ id: SearchEngine.BRAVE, name: 'Brave', builtin: false });
    return engines;
  }

  async testSearchEngine(engine: 'tavily' | 'serper' | 'naver' | 'brave', query: string) {
    return { result: await this.webSearchProvider.searchSingle(engine, query) };
  }

  /** AI 필터링 없이 원본 검색 결과 반환 (URL 보존 목적) */
  async searchRaw(engine: SearchEngine, query: string): Promise<string> {
    if (isBuiltinSearchEngine(engine)) return '';
    return this.webSearchProvider.searchSingle(engine, query);
  }

  async searchByEngine(engine: SearchEngine, query: string, filterModel?: string): Promise<string> {
    if (isBuiltinSearchEngine(engine)) return '';
    const raw = await this.webSearchProvider.searchSingle(engine, query);
    if (!raw) return raw;
    try {
      const { text } = await this.aiService.call(
        filterModel || WebSearchService.FILTER_MODEL,
        `You are a mechanical text filter. Your ONLY task is to DELETE certain lines from search results.

STRICT RULES:
1. Your output must be a strict subset of the input — every line you output must appear verbatim in the input.
2. Do NOT write, infer, deduce, explain, summarize, rephrase, or translate ANYTHING.
3. Do NOT add any word, sentence, or character that is not already in the input.

DELETE only these:
- Advertisements and promotional content
- Navigation menus and UI chrome (e.g. "로그인", "메뉴", "홈", "뒤로가기", breadcrumbs)
- Cookie/privacy/GDPR notices
- Exact duplicate paragraphs (keep first occurrence only)
- Sentences that have zero relation to the query topic

NEVER DELETE:
- URLs (any line containing http:// or https://)
- Source names, site names, publication dates, author names
- Numbers, statistics, percentages, prices, rankings
- Quoted text or cited content
- Any sentence about the query topic, even if brief`,
        `Query: "${query}"\n\nSearch results to filter:\n\n${raw}`,
      );
      return text || raw;
    } catch {
      return raw;
    }
  }

}
