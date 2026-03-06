import { Injectable, Logger } from '@nestjs/common';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { searchTavilyLight } from '../../infrastructure/search/tavily.search';
import { SearchPlannerService, SearchPlan, SearchSource } from '../search-planner.service';
import { RecruitContextService } from '../../../recruit/application/recruit-context.service';
import { AiClientService } from '../../../ai/application/ai-client.service';

export type JobItem = { title: string; company: string; location?: string | null; description?: string | null; skills: string[]; url: string };

export type LightResearchEvent =
  | { type: 'start' }
  | { type: 'plan'; source: SearchSource; reason: string }
  | { type: 'searching'; target: 'web' | 'recruit' }
  | { type: 'log'; message: string }
  | { type: 'jobs'; jobs: JobItem[] }
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

  constructor(
    private readonly planner: SearchPlannerService,
    private readonly recruitContext: RecruitContextService,
    private readonly aiClient: AiClientService,
  ) {}

  /** 파이프라인 테스트용 — fullPrompt, searchContext, searchPlan 포함 반환 */
  async testRun(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchSource | 'auto' },
  ) {
    const searchMode = opts?.searchMode ?? 'auto';
    const searchPlan: SearchPlan = searchMode === 'auto'
      ? await this.planner.plan(topic)
      : { source: searchMode, reason: '수동 지정', keyword: topic };

    const { source, keyword } = searchPlan;

    let webContext: string | undefined;
    if ((source === 'web' || source === 'both') && this.hasTavily()) {
      try { webContext = await searchTavilyLight(keyword); } catch { /* 무시 */ }
    }

    let recruitCtx: string | undefined;
    if (source === 'recruit' || source === 'both') {
      for await (const event of this.recruitContext.liveSearch({ keyword, companyTypes: searchPlan.companyTypes, jobTypes: searchPlan.jobTypes })) {
        if (event.type === 'result' && event.result) recruitCtx = event.result;
      }
    }

    const parts = [webContext, recruitCtx].filter(Boolean) as string[];
    const searchContext = parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;

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

  // *********** //
  // 파이프라인 실행 //
  // *********** //
  async *runStream(
    topic: string,
    model: string,
    searchMode: SearchSource | 'auto' = 'auto',
  ): AsyncGenerator<LightResearchEvent> {
    
    yield* this.printFront(`검색 소스 결정 중...`);

    const searchPlan: SearchPlan = searchMode === 'auto'
      ? await this.planner.plan(topic)
      : { source: searchMode, reason: '수동 지정', keyword: topic };

    if (searchPlan.model) {
      yield* this.printFront(`플래에 사용된 모델: ${searchPlan.model}`);
      yield* this.printFront(`플랜 결과: ${searchPlan.source}`);
      yield* this.printFront(`플랜 이유: ${searchPlan.reason}`);
      yield* this.printFront(`서칭 키워드: ${searchPlan.keyword}`);
    }

    const { source, keyword } = searchPlan;

    let webContext: string | undefined;
    if ((source === 'web' || source === 'both') && this.hasTavily()) {
      yield* this.printFront(`웹 검색을 시작하겠습니다. 잠시만 기다려주세요.`);

      try {
        webContext = await searchTavilyLight(keyword);
        const lines = webContext?.split('\n').length ?? 0;
        yield* this.printFront(`웹 검색 완료 — ${lines}줄 수집`);
      } catch {
        yield* this.printFront('웹 검색 실패 (무시됨)');
      }
    }

    let recruitCtx: string | undefined;
    if (source === 'recruit' || source === 'both') {
      yield* this.printFront(`채용 공고 검색을 시작하겠습니다. 잠시만 기다려주세요.`);
      const filterDesc = [
        searchPlan.companyTypes?.length ? `기업유형: ${searchPlan.companyTypes.join(', ')}` : '',
        searchPlan.jobTypes?.length ? `경력: ${searchPlan.jobTypes.join(', ')}` : '',
      ].filter(Boolean).join(' / ');
      yield* this.printFront(`검색 키워드: ${keyword}${filterDesc ? ` / ${filterDesc}` : ''}`);

      for await (const event of this.recruitContext.liveSearch({ keyword, companyTypes: searchPlan.companyTypes, jobTypes: searchPlan.jobTypes })) {
        if (event.type === 'log') yield* this.printFront(event.message);
        else if (event.type === 'jobs') yield { type: 'jobs', jobs: event.jobs };
        else if (event.type === 'result' && event.result) recruitCtx = event.result;
      }
    }

    // ── Step 2: AI 태스크 생성 ──
    yield* this.printFront(`AI 검색 실행을 시작하겠습니다. 잠시만 기다려주세요.`);
    yield* this.printFront(`사용된 모델: ${model}`);

    const parts = [webContext, recruitCtx].filter(Boolean) as string[];
    const searchContext = parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;
    const fullPrompt = source === 'recruit' && recruitCtx
      ? PROMPTS.generateTasksForRecruit(topic, recruitCtx)
      : PROMPTS.generateTasks(topic, searchContext);
    const promptChars = fullPrompt.length;
    const approxTokens = Math.round(promptChars / 4);
    const inputCostPer1M = this.aiClient.getInputCostPer1M(model);
    const estimatedCost = inputCostPer1M != null
      ? ` / 입력 비용 약 $${((approxTokens / 1_000_000) * inputCostPer1M).toFixed(5)}`
      : '';
    yield* this.printFront(`프롬프트 크기: ${promptChars.toLocaleString()}자 / 약 ${approxTokens.toLocaleString()} 토큰${estimatedCost}`);
    const raw = await this.callAI(model, fullPrompt);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);

    yield* this.printFront(`AI 응답 — 태스크 ${tasks.length}개 파싱 완료`);

    yield { type: 'done', tasks, searchPlan };
  }

  private *printFront(message: string): Generator<LightResearchEvent> {
    yield { type: 'log', message };
  }

  private hasTavily(): boolean {
    return !!process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_');
  }

  private async callAI(model: string, prompt: string, systemOverride?: string): Promise<string> {
    const system = systemOverride ?? PROMPTS.system;
    const provider = model.startsWith('claude') ? 'Anthropic'
      : model.startsWith('gemini') ? 'Google'
      : model.startsWith('ollama:') ? `Ollama (${model.slice('ollama:'.length)})`
      : 'OpenAI';
    this.logger.log(`[태스크 생성] ${provider} — model=${model}`);
    return this.aiClient.call(model, system, prompt);
  }
}
