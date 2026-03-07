import { Injectable } from '@nestjs/common';
import { searchTavily } from '../../infrastructure/search/tavily.search';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { SearchSources } from '../../domain/model/search-sources.model';
import { AiClientService } from '../../../ai/application/ai-client.service';

export interface DeepResearchResult {
  result: string;
  sources: SearchSources;
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
    model: string,
    /** QueueService에서 이미 검색 결과를 받아온 경우 직접 넘겨 Step 1을 건너뜀 */
    contextOverride?: string,
  ): Promise<DeepResearchResult> {
    let context = contextOverride ?? '';
    let sources: SearchSources = {};

    // Step 1: Tavily 검색 (contextOverride 없을 때만 실행)
    if (!contextOverride) {
      if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
        try {
          const tavilyResult = await searchTavily(prompt);
          if (tavilyResult) {
            context = tavilyResult;
            sources = { tavily: tavilyResult };
          }
        } catch {
          // 검색 실패 시 컨텍스트 없이 진행
        }
      }
    }

    // Step 2: AI 심층 분석
    const result = await this.deepAnalyze(model, prompt, context);
    return { result, sources };
  }

  private deepAnalyze(model: string, prompt: string, context: string): Promise<string> {
    const fullPrompt = context ? PROMPTS.withSearchContext(context, prompt) : prompt;
    // 검색 컨텍스트가 없을 때만 내장 웹서치 사용
    const useBuiltinSearch = !context;
    return this.aiClient.call(model, PROMPTS.system, fullPrompt, { useBuiltinSearch });
  }
}
