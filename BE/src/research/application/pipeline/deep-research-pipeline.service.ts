import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { WebSearchService } from '../web-search.service';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { SearchSources } from '../../domain/model/search-sources.model';
import { callAnthropic } from '../../infrastructure/ai/anthropic.ai';
import { callOpenAI } from '../../infrastructure/ai/openai.ai';
import { callGoogle } from '../../infrastructure/ai/google.ai';
import { callOllama } from '../../infrastructure/ai/ollama.ai';

export interface DeepResearchResult {
  result: string;
  sources: SearchSources;
}

/**
 * DeepResearch 3단계 파이프라인
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Step 1. 외부 검색 (Tavily / Serper / Naver / Brave)      │
 * │          → 병렬 실행 후 원본 검색 결과 수집                    │
 * ├─────────────────────────────────────────────────────────┤
 * │  Step 2. 로컬 AI 필터링 (Ollama)                           │
 * │          → 중복·불필요 내용 제거, 핵심 정보 압축                 │
 * ├─────────────────────────────────────────────────────────┤
 * │  Step 3. 고성능 AI 심층 분석 (Claude 등)                     │
 * │          → 압축된 컨텍스트 기반 최종 답변 생성                  │
 * └─────────────────────────────────────────────────────────┘
 */
@Injectable()
export class DeepResearchPipelineService {
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  constructor(private readonly searchService: WebSearchService) {}

  async run(
    prompt: string,
    model: string,
    /** FE에서 이미 검색 결과를 받아온 경우 context를 직접 넘겨 Step 1,2를 건너뜀 */
    contextOverride?: string,
  ): Promise<DeepResearchResult> {
    // ── Step 1 & 2: 외부 검색 → Ollama 필터링 ──
    let context = contextOverride ?? '';
    let sources: SearchSources = {};

    if (!contextOverride) {
      const searchResult = await this.searchService.runSearch(prompt);
      context = searchResult.context;
      sources = searchResult.sources;
    }

    // ── Step 3: 고성능 AI 심층 분석 ──
    const result = await this.deepAnalyze(model, prompt, context);

    return { result, sources };
  }

  private async deepAnalyze(model: string, prompt: string, context: string): Promise<string> {
    const system = PROMPTS.system;
    const fullPrompt = context ? PROMPTS.withSearchContext(context, prompt) : prompt;
    const useBuiltinSearch = !context && !this.searchService.hasExternalSearch();

    if (model.startsWith('claude')) {
      return callAnthropic(this.anthropic, model, system, fullPrompt, useBuiltinSearch);
    } else if (model.startsWith('gemini')) {
      return callGoogle(this.google, model, system + '\n\n' + fullPrompt, useBuiltinSearch);
    } else if (model.startsWith('ollama:')) {
      return callOllama(model.slice('ollama:'.length), system, fullPrompt);
    } else {
      return callOpenAI(this.openai, model, system, fullPrompt);
    }
  }
}
