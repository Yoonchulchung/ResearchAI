import { Injectable } from '@nestjs/common';
import { DEEP_RESEARCH_PROMPTS as PROMPTS } from 'src/research/domain/prompt/research.prompts';
import { SearchSources } from 'src/research/domain/model/search-sources.model';
import { ConfidenceScore } from 'src/research/domain/model/confidence.model';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { AiService } from 'src/ai/application/ai.service';
import { WebSearchService } from 'src/research/application/web-search.service';
import {
  SearchEngine,
  isBuiltinSearchEngine,
} from 'src/research/domain/model/search-planner.model';
import { BrowserService } from 'src/browse/application/browser.service';
import { NewsService } from 'src/news/application/service/news.service';
import {
  ChartData,
  isChartTrigger,
  CHART_TOOL_ANTHROPIC,
  CHART_TOOL_OPENAI,
  CHART_SYSTEM_ADDENDUM,
} from 'src/research/application/chart/chart-tool';

export interface DeepResearchResult {
  aiResult: string;
  webSources: SearchSources;
  confidence: ConfidenceScore;
  inputTokens: number;
  outputTokens: number;
  estimatedFees: number;
  searchLog?: { query: string; result: string }[];
  usedWebModel: string;
  chartData?: ChartData[];
}

export type DeepResearchEvent =
  | { type: 'log'; message: string }
  | { type: 'done'; result: string; sources: SearchSources };

/**
 * DeepResearch 파이프라인
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  [Claude / OpenAI] AI 에이전트 루프                        │
 * │    → AI가 web_search 도구 호출 여부를 직접 결정              │
 * │    → 필요 시 여러 번 검색 가능 (max 5회)                     │
 * ├─────────────────────────────────────────────────────────┤
 * │  [Gemini / Ollama] 고정 파이프라인                          │
 * │    Step 1. 웹 검색 → Step 2. AI 심층 분석                  │
 * |    AI 벤더사에서 제공하는 Web 검색 사용안하면 Ollama로 필터 적용 있음 |
 * ├─────────────────────────────────────────────────────────┤
 * │  Step 3. 신뢰도 평가 (Haiku 고정, 압축 컨텍스트)              │
 * │          → 출처·교차검증·불확실성 기반 0~100점 산출             │
 * └─────────────────────────────────────────────────────────┘
 *
 * 벡터화(Qdrant)는 SessionsService.updateTask()에서 비동기로 처리됨
 */
@Injectable()
export class DeepResearchPipelineService {
  private static readonly CONFIDENCE_MODEL = 'claude-haiku-4-5-20251001';
  private static readonly BODY_LIMIT = 400;

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly aiService: AiService,
    private readonly webSearch: WebSearchService,
    private readonly browser: BrowserService,
    private readonly newsService: NewsService,
  ) {}

  async run(
    prompt: string,
    aiModel: string,
    webModel: SearchEngine = SearchEngine.TAVILY,
    /** QueueService에서 이미 검색 결과를 받아온 경우 직접 넘겨 에이전트 루프를 건너뜀 */
    contextOverride?: string,
    signal?: AbortSignal,
    filterModel?: string,
  ): Promise<DeepResearchResult> {
    let aiResult = '';
    let webSources: SearchSources = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedFees = 0;
    let searchLog: { query: string; result: string }[] | undefined;
    let chartData: ChartData[] | undefined;

    const useChart = isChartTrigger(prompt);
    const chartSystem = useChart
      ? PROMPTS.system + CHART_SYSTEM_ADDENDUM
      : PROMPTS.system;

    const chartToolHandlers = useChart
      ? {
          generate_chart: async (input: unknown) => {
            const data = input as ChartData;
            chartData = [...(chartData ?? []), data];
            return { text: '차트 데이터가 저장되었습니다.', data };
          },
        }
      : undefined;

    const chartExtraTools = useChart
      ? { anthropic: [CHART_TOOL_ANTHROPIC], openai: [CHART_TOOL_OPENAI] }
      : undefined;

    if (contextOverride) {
      const usage = await this.deepAnalyze(
        aiModel,
        prompt,
        contextOverride,
        signal,
        chartSystem,
      );
      aiResult = usage.text;
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
      estimatedFees = usage.estimatedFees;
      webSources = { [webModel]: contextOverride };
    } else if (isBuiltinSearchEngine(webModel)) {
      const usage = await this.deepAnalyze(aiModel, prompt, '', signal, chartSystem);
      aiResult = usage.text;
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
      estimatedFees = usage.estimatedFees;
      if (usage.searchLog?.length) {
        searchLog = usage.searchLog;
        webSources = {
          [webModel]: usage.searchLog
            .map((s) => `Q: ${s.query}\n${s.result}`)
            .join('\n\n'),
        };
      }
    } else if (this.supportsAgentLoop(aiModel)) {
      // Claude / OpenAI: AI 에이전트 루프 (다중 엔진 검색 + 차트 툴)
      const searchFn = this.getEnhancedSearchFn(webModel, filterModel);
      const agentResult = await this.aiService.runAgenticLoop(
        aiModel,
        chartSystem,
        prompt,
        searchFn,
        5,
        signal,
        chartExtraTools,
        chartToolHandlers,
      );
      aiResult = agentResult.result;
      inputTokens = agentResult.inputTokens;
      outputTokens = agentResult.outputTokens;
      estimatedFees = agentResult.estimatedFees;
      if (agentResult.searchLog.length > 0) {
        searchLog = agentResult.searchLog;
        webSources = {
          [webModel]: agentResult.searchLog.map((s) => s.result).join('\n\n'),
        };
      }
      if (agentResult.toolData['generate_chart']?.length) {
        chartData = agentResult.toolData['generate_chart'] as ChartData[];
      }
    } else {
      // Gemini / Ollama: 고정 파이프라인 (다중 엔진 검색 → 분석)
      let context = '';
      try {
        const searchResult = await this.doEnhancedSearch(webModel, prompt, filterModel);
        if (searchResult) {
          context = searchResult;
          webSources = { [webModel]: searchResult };
          searchLog = [{ query: prompt, result: searchResult }];
        }
      } catch {
        // 검색 실패 시 컨텍스트 없이 진행
      }
      const usage = await this.deepAnalyze(aiModel, prompt, context, signal, chartSystem);
      aiResult = usage.text;
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
      estimatedFees = usage.estimatedFees;
    }

    // Step 3: 신뢰도 평가 (Haiku 고정, 압축된 컨텍스트 사용)
    const context = webSources[webModel] ?? '';
    const confidence = context
      ? await this.evaluateConfidence(aiResult, context)
      : {
          score: 50,
          reason:
            '검색 결과 없이 AI 자체 지식으로 답변하여 신뢰도를 측정할 수 없습니다.',
        };

    return {
      aiResult,
      webSources,
      confidence,
      inputTokens,
      outputTokens,
      estimatedFees,
      searchLog,
      usedWebModel: webModel,
      chartData,
    };
  }

  /** Claude / OpenAI는 tool use API 지원 → 에이전트 루프 사용 */
  private supportsAgentLoop(aiModel: string): boolean {
    return (
      aiModel.startsWith('claude') ||
      (!aiModel.startsWith('gemini') && !aiModel.startsWith('ollama:'))
    );
  }

  /** 웹 검색(Serper→DDG) + Naver 뉴스 병렬 실행 후 포맷된 컨텍스트 반환 */
  private async doEnhancedSearch(
    webModel: SearchEngine,
    query: string,
    filterModel?: string,
  ): Promise<string> {
    const [webRaw, newsRaw] = await Promise.allSettled([
      this.browser.searchWeb(query, 10),
      this.newsService.getQueryNews(query, 1).catch(() => ({ items: [] })),
    ]);

    const webItems = webRaw.status === 'fulfilled' ? webRaw.value : [];
    const newsItems = newsRaw.status === 'fulfilled' ? newsRaw.value.items : [];
    const seen = new Set(newsItems.map((n) => n.url));
    const dedupedWeb = webItems.filter((w) => !seen.has(w.url));
    const all = [...newsItems, ...dedupedWeb];

    if (all.length > 0) {
      return all
        .map((item, i) => {
          const date =
            'publishedAt' in item && item.publishedAt
              ? ` (${String(item.publishedAt).substring(0, 10)})`
              : '';
          const src = 'source' in item ? item.source : '';
          return `[${i + 1}] ${item.title}${date}\n${item.snippet ?? ''}\n출처: ${item.url}${src ? ` (${src})` : ''}`;
        })
        .join('\n\n');
    }

    // 폴백: 기존 단일 엔진
    return this.webSearch.searchByEngine(webModel, query, filterModel) ?? '';
  }

  /** 에이전트 루프에 전달할 다중 엔진 검색 함수 */
  private getEnhancedSearchFn(
    webModel: SearchEngine,
    filterModel?: string,
  ): (query: string) => Promise<string> {
    return (query: string) =>
      this.doEnhancedSearch(webModel, query, filterModel);
  }

  private deepAnalyze(
    aiModel: string,
    prompt: string,
    context: string,
    signal?: AbortSignal,
    systemOverride?: string,
  ) {
    const system = systemOverride ?? PROMPTS.system;
    const fullPrompt = context
      ? PROMPTS.withSearchContext(context, prompt)
      : prompt;
    const useBuiltinSearch = !context;
    return this.aiProvider.call(aiModel, system, fullPrompt, {
      useBuiltinSearch,
      signal,
    });
  }

  /**
   * 각 소스 블록의 본문을 BODY_LIMIT자로 잘라 토큰을 절약한다.
   * deepAnalyze()에 전달하는 원본 context는 그대로 유지됨.
   */
  private compressContext(context: string): string {
    const blocks = context.split(/(?=\[.+\]\n)/);
    return blocks
      .map((block) => {
        const sourceMatch = block.match(/출처:\s*(.+)/);
        const url = sourceMatch ? sourceMatch[1].trim() : '';
        const bodyStart = block.indexOf('\n') + 1;
        const bodyEnd = sourceMatch ? block.lastIndexOf('출처:') : block.length;
        const body = block.slice(bodyStart, bodyEnd).trim();
        const truncatedBody =
          body.length > DeepResearchPipelineService.BODY_LIMIT
            ? body.slice(0, DeepResearchPipelineService.BODY_LIMIT) + '...'
            : body;
        const title = block.split('\n')[0];
        return `${title}\n${truncatedBody}${url ? `\n출처: ${url}` : ''}`;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private async evaluateConfidence(
    answer: string,
    context: string,
  ): Promise<ConfidenceScore> {
    const compressed = this.compressContext(context);
    return this.aiService.evaluateConfidence(
      answer,
      compressed,
      DeepResearchPipelineService.CONFIDENCE_MODEL,
    );
  }
}
