import { Injectable } from '@nestjs/common';
import { searchTavily } from '../../infrastructure/search/tavily.search';
import { searchSerper } from '../../infrastructure/search/serper.search';
import { searchNaver } from '../../infrastructure/search/naver.search';
import { searchBrave } from '../../infrastructure/search/brave.search';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { SearchSources } from '../../domain/model/search-sources.model';
import { AiClientService } from '../../../ai/application/ai-client.service';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';

export interface DeepResearchResult {
  aiResult: string;
  webSources: SearchSources;
}

export type DeepResearchEvent =
  | { type: 'log'; message: string }
  | { type: 'done'; result: string; sources: SearchSources };

/**
 * DeepResearch 2단계 파이프라인 (Tavily → Claude)
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Step 1. Tavily 검색                                      │
 * │          → 관련 웹 페이지 수집 및 본문 추출                    │
 * ├─────────────────────────────────────────────────────────┤
 * │  Step 2. AI 심층 분석 (Claude 등)                          │
 * │          → 검색 결과 기반 최종 답변 생성                       │
 * └─────────────────────────────────────────────────────────┘
 *
 * 벡터화(Qdrant)는 SessionsService.updateTask()에서 비동기로 처리됨
 */
@Injectable()
export class DeepResearchPipelineService {
  constructor(private readonly aiClient: AiClientService) {}

  async run(
    prompt: string,
    aiModel: string,
    webModel: SearchEngine = SearchEngine.TAVILY,
    /** QueueService에서 이미 검색 결과를 받아온 경우 직접 넘겨 Step 1을 건너뜀 */
    contextOverride?: string,
  ): Promise<DeepResearchResult> {
    let context = contextOverride ?? '';
    let webSources: SearchSources = {};

    // Step 1: 웹 검색 (contextOverride 없을 때만 실행)
    if (!contextOverride) {
      try {
        let searchResult: string | undefined;
        if (webModel === SearchEngine.TAVILY) {
          searchResult = await searchTavily(prompt);
        } else if (webModel === SearchEngine.SERPER) {
          searchResult = await searchSerper(prompt);
        } else if (webModel === SearchEngine.NAVER) {
          searchResult = await searchNaver(prompt);
        } else if (webModel === SearchEngine.BRAVE) {
          searchResult = await searchBrave(prompt);
        }
        if (searchResult) {
          context = searchResult;
          webSources = { [webModel]: searchResult };
        }
      } catch {
        // 검색 실패 시 컨텍스트 없이 진행
      }
    }

    // Step 2: AI 심층 분석
    const aiResult = await this.deepAnalyze(aiModel, prompt, context);
    return { aiResult, webSources };
  }

  private deepAnalyze(aiModel: string, prompt: string, context: string): Promise<string> {
    const fullPrompt = context ? PROMPTS.withSearchContext(context, prompt) : prompt;
    // 검색 컨텍스트가 없을 때만 내장 웹서치 사용
    const useBuiltinSearch = !context;
    return this.aiClient.call(aiModel, PROMPTS.system, fullPrompt, { useBuiltinSearch });
  }
}
