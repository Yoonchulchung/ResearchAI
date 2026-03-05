import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { searchTavily } from '../../infrastructure/search/tavily.search';
import { callAnthropic } from '../../infrastructure/ai/anthropic.ai';
import { callOpenAI } from '../../infrastructure/ai/openai.ai';
import { callGoogle } from '../../infrastructure/ai/google.ai';
import { callOllama } from '../../infrastructure/ai/ollama.ai';
import { SearchPlannerService, SearchPlan, SearchSource } from '../search-planner.service';
import { RecruitContextService } from '../../../recruit/application/recruit-context.service';

export type LightResearchEvent =
  | { type: 'start' }
  | { type: 'plan'; source: SearchSource; reason: string }
  | { type: 'searching'; target: 'web' | 'recruit' }
  | { type: 'generating'; model: string }
  | { type: 'done'; tasks: any[]; searchPlan: SearchPlan };

/**
 * LightResearch 파이프라인
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Step 0. 검색 소스 결정 (searchMode)                               │
 * │          auto → Ollama 라우터가 web / recruit / both 판단           │
 * │          직접 지정 → 지정값 사용                                     │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  Step 1a. 웹 검색 (web / both, Tavily API 키 필요)                  │
 * │  Step 1b. 채용 공고 크롤러 실시간 실행 (recruit / both)                  │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  Step 2. AI 태스크 목록 생성 (Claude 등)                             │
 * │          → 합산된 컨텍스트 기반으로 조사 항목 5~7개 생성                  │
 * └─────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class LightResearchPipelineService {
  private readonly logger = new Logger(LightResearchPipelineService.name);

  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  constructor(
    private readonly planner: SearchPlannerService,
    private readonly recruitContext: RecruitContextService,
  ) {}

  // *********** //
  // 파이프라인 실행 //
  // *********** //
  async run(
    topic: string,
    model: string,
    searchMode: SearchSource | 'auto' = 'auto',
  ): Promise<{ tasks: any[]; searchPlan: SearchPlan }> {
    const { tasks, searchPlan } = await this.generate(topic, model, searchMode);
    return { tasks, searchPlan };
  }

  /** 파이프라인 테스트용 — fullPrompt, searchContext, searchPlan 포함 반환 */
  async testRun(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchSource | 'auto' },
  ) {
    return this.generate(topic, model, opts?.searchMode ?? 'auto', opts);
  }

  // *************** //
  // 파이프라인 상태 확인 //
  // *************** //
  async *runStream(
    topic: string,
    model: string,
    searchMode: SearchSource | 'auto' = 'auto',
  ): AsyncGenerator<LightResearchEvent> {
    yield { type: 'start' };

    // ── Step 0: 검색 소스 결정 ──
    const searchPlan: SearchPlan = searchMode === 'auto'
      ? await this.planner.plan(topic)
      : { source: searchMode, reason: '수동 지정' };

    yield { type: 'plan', source: searchPlan.source, reason: searchPlan.reason };

    const { source } = searchPlan;
    this.logger.log(`[LightSearch] ${source}`);

    // ── Step 1a: 웹 검색 ──
    let webContext: string | undefined;
    if ((source === 'web' || source === 'both') && this.hasTavily()) {
      yield { type: 'searching', target: 'web' };
      try {
        webContext = await searchTavily(topic);
      } catch {
        // 실패 시 무시
      }
    }

    // ── Step 1b: 채용 공고 크롤러 실시간 실행 ──
    let recruitCtx: string | undefined;
    if (source === 'recruit' || source === 'both') {
      yield { type: 'searching', target: 'recruit' };
      const result = await this.recruitContext.liveSearch(topic);
      this.logger.log(`[채용 공고 검색] ${result ? `${result.split('\n').length}줄 수집` : '결과 없음'}\n${result ?? ''}`);
      if (result) recruitCtx = result;
    }

    // ── Step 2: AI 태스크 생성 ──
    yield { type: 'generating', model };

    const parts = [webContext, recruitCtx].filter(Boolean) as string[];
    const searchContext = parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;
    const fullPrompt = source === 'recruit' && recruitCtx
      ? PROMPTS.generateTasksForRecruit(topic, recruitCtx)
      : PROMPTS.generateTasks(topic, searchContext);
    const raw = await this.callAI(model, fullPrompt);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);

    yield { type: 'done', tasks, searchPlan };
  }

  // ******************** //
  // 파이프라인 - Deprecated //
  // ******************** //
  private async generate(
    topic: string,
    model: string,
    searchMode: SearchSource | 'auto' = 'auto',
    opts?: { customPrompt?: string; customSystem?: string },
  ) {
    // ── Step 0: 검색 소스 결정 ──
    const searchPlan: SearchPlan = searchMode === 'auto'
      ? await this.planner.plan(topic)
      : { source: searchMode, reason: '수동 지정' };

    const { source } = searchPlan;

    // ── Step 1a: 웹 검색 ──
    let webContext: string | undefined;
    if ((source === 'web' || source === 'both') && this.hasTavily()) {
      try {
        webContext = await searchTavily(topic);
      } catch {
        // 실패 시 무시
      }
    }

    // ── Step 1b: 채용 공고 크롤러 실시간 실행 ──
    let recruitCtx: string | undefined;
    if (source === 'recruit' || source === 'both') {
      const result = await this.recruitContext.liveSearch(topic);
      if (result) recruitCtx = result;
    }

    // ── context 합산 ──
    const parts = [webContext, recruitCtx].filter(Boolean) as string[];
    const searchContext = parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;

    // ── Step 2: AI 태스크 생성 ──
    const fullPrompt = opts?.customPrompt
      ? opts.customPrompt
          .replaceAll('{{topic}}', topic)
          .replaceAll('{{searchContext}}', searchContext ?? '')
      : source === 'recruit' && recruitCtx
        ? PROMPTS.generateTasksForRecruit(topic, recruitCtx)
        : PROMPTS.generateTasks(topic, searchContext);

    const raw = await this.callAI(model, fullPrompt, opts?.customSystem);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);

    return { tasks, searchContext, fullPrompt, searchPlan };
  }

  private hasTavily(): boolean {
    return !!process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_');
  }

  private async callAI(model: string, prompt: string, systemOverride?: string): Promise<string> {
    const system = systemOverride ?? PROMPTS.system;

    if (model.startsWith('claude')) {
      this.logger.log(`[태스크 생성] Anthropic — model=${model}`);
      return callAnthropic(this.anthropic, model, system, prompt, false);
    } else if (model.startsWith('gemini')) {
      this.logger.log(`[태스크 생성] Google — model=${model}`);
      return callGoogle(this.google, model, system + '\n\n' + prompt, false);
    } else if (model.startsWith('ollama:')) {
      const ollamaModel = model.slice('ollama:'.length);
      const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
      this.logger.log(`[태스크 생성] Ollama — model=${ollamaModel} url=${ollamaUrl}`);
      return callOllama(ollamaModel, system, prompt);
    } else {
      this.logger.log(`[태스크 생성] OpenAI — model=${model}`);
      return callOpenAI(this.openai, model, system, prompt);
    }
  }
}
