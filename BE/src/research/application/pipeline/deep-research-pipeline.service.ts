import { Injectable } from '@nestjs/common';
import { DEEP_RESEARCH_PROMPTS as PROMPTS } from '../../domain/prompt/research.prompts';
import { SearchSources } from '../../domain/model/search-sources.model';
import { ConfidenceScore } from '../../domain/model/confidence.model';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';
import { AiService } from '../../../ai/application/ai.service';
import { WebSearchService } from '../web-search.service';
import { SearchEngine, isBuiltinSearchEngine } from '../../domain/model/search-planner.model';

export interface DeepResearchResult {
  aiResult: string;
  webSources: SearchSources;
  confidence: ConfidenceScore;
  inputTokens: number;
  outputTokens: number;
  estimatedFees: number;
  searchLog?: { query: string; result: string }[];
  usedWebModel: string;
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

    if (contextOverride) {
      // 미리 가져온 컨텍스트: 기존 방식으로 분석
      const usage = await this.deepAnalyze(aiModel, prompt, contextOverride, signal);
      aiResult = usage.text;
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
      estimatedFees = usage.estimatedFees;
      webSources = { [webModel]: contextOverride };

    } else if (isBuiltinSearchEngine(webModel)) {
      // AI 벤더 내장 검색: useBuiltinSearch=true 로 AI 단독 처리
      const usage = await this.deepAnalyze(aiModel, prompt, '', signal);
      aiResult = usage.text;
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
      estimatedFees = usage.estimatedFees;
      if (usage.searchLog?.length) {
        searchLog = usage.searchLog;
        webSources = { [webModel]: usage.searchLog.map((s) => `Q: ${s.query}\n${s.result}`).join('\n\n') };
      }

    } else if (this.supportsAgentLoop(aiModel)) {
      // Claude / OpenAI: AI 에이전트 루프
      const searchFn = this.getSearchFn(webModel, filterModel);
      const agentResult = await this.aiService.runAgenticLoop(
        aiModel,
        PROMPTS.system,
        prompt,
        searchFn,
        5,
        signal,
      );
      aiResult = agentResult.result;
      if (agentResult.searchLog.length > 0) {
        searchLog = agentResult.searchLog;
        webSources = { [webModel]: agentResult.searchLog.map((s) => s.result).join('\n\n') };
      }
    } else {
      // Gemini / Ollama: 고정 파이프라인 (검색 → 분석)
      let context = '';
      try {
        const searchResult = await this.doSearch(webModel, prompt);
        if (searchResult) {
          context = searchResult;
          webSources = { [webModel]: searchResult };
          searchLog = [{ query: prompt, result: searchResult }];
        }
      } catch {
        // 검색 실패 시 컨텍스트 없이 진행
      }
      const usage = await this.deepAnalyze(aiModel, prompt, context, signal);
      aiResult = usage.text;
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
      estimatedFees = usage.estimatedFees;
    }

    // Step 3: 신뢰도 평가 (Haiku 고정, 압축된 컨텍스트 사용)
    const context = webSources[webModel] ?? '';
    const confidence = context
      ? await this.evaluateConfidence(aiResult, context)
      : { score: 50, reason: '검색 결과 없이 AI 자체 지식으로 답변하여 신뢰도를 측정할 수 없습니다.' };

    return { aiResult, webSources, confidence, inputTokens, outputTokens, estimatedFees, searchLog, usedWebModel: webModel };
  }

  /** Claude / OpenAI는 tool use API 지원 → 에이전트 루프 사용 */
  private supportsAgentLoop(aiModel: string): boolean {
    return aiModel.startsWith('claude') || (!aiModel.startsWith('gemini') && !aiModel.startsWith('ollama:'));
  }

  private getSearchFn(webModel: SearchEngine, filterModel?: string): (query: string) => Promise<string> {
    return (query: string) => this.webSearch.searchByEngine(webModel, query, filterModel);
  }

  private doSearch(webModel: SearchEngine, query: string, filterModel?: string): Promise<string | undefined> {
    return this.webSearch.searchByEngine(webModel, query, filterModel);
  }

  private deepAnalyze(aiModel: string, prompt: string, context: string, signal?: AbortSignal) {
    const fullPrompt = context ? PROMPTS.withSearchContext(context, prompt) : prompt;
    const useBuiltinSearch = !context;
    return this.aiProvider.call(aiModel, PROMPTS.system, fullPrompt, { useBuiltinSearch, signal });
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

  private async evaluateConfidence(answer: string, context: string): Promise<ConfidenceScore> {
    const compressed = this.compressContext(context);
    return this.aiService.evaluateConfidence(answer, compressed, DeepResearchPipelineService.CONFIDENCE_MODEL);
  }
}
