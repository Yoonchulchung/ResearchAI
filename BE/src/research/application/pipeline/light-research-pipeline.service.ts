import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { searchTavilyLight } from '../../infrastructure/search/tavily.search';
import { searchSerper } from '../../infrastructure/search/serper.search';
import { searchNaver } from '../../infrastructure/search/naver.search';
import { searchBrave } from '../../infrastructure/search/brave.search';
import { SearchPlannerService, SearchModeInput } from '../search-planner.service';
import { SearchPlan, SearchMode, PlannerMode, SearchEngine } from 'src/research/domain/model/search-planner.model';
import { AIProvider, AI_MODEL_PREFIX, getProvider } from '../../../ai/domain/models';
import { RecruitContextService } from '../../../recruit/application/recruit-context.service';
import { AiProviderService } from '../../../ai/application/ai-provider.service';
import { SearchListRepository } from '../../domain/repository/search-list.repository';
import { ResearchRecruitRepository } from '../../domain/repository/research-recruit.repository';
import { LightResearchEventType } from '../../domain/model/light-research.model';

export type JobItem = { title: string; company: string; location?: string | null; description?: string | null; skills: string[]; url: string };

export type LightResearchEvent =
  | { type: LightResearchEventType.START }
  | { type: LightResearchEventType.PLAN; searchMode: SearchMode; reason: string }
  | { type: LightResearchEventType.LOG; message: string }
  | { type: LightResearchEventType.JOBS; jobs: JobItem[] }
  | { type: LightResearchEventType.GENERATING; model: string }
  | { type: LightResearchEventType.DONE; tasks: any[]; searchPlan: SearchPlan }
  | { type: LightResearchEventType.SAVEDB; action: 'recruit'; searchId: string; jobs: JobItem[] }
  | { type: LightResearchEventType.SAVEDB; action: 'searchList'; searchId: string; tasks: { title: string; prompt: string }[] };

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
    private readonly aiProvier: AiProviderService,
    private readonly searchListRepository: SearchListRepository,
    private readonly researchRecruitRepository: ResearchRecruitRepository,
  ) {}

  /** 파이프라인 테스트용 — fullPrompt, searchContext, searchPlan 포함 반환 */
  async testRun(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchModeInput },
  ) {
    const searchMode = opts?.searchMode ?? PlannerMode.AUTO;
    const searchPlan: SearchPlan = searchMode === PlannerMode.AUTO
      ? await this.planner.plan(topic)
      : { searchMode, reason: '수동 지정', keyword: topic };

    const { keyword } = searchPlan;

    let webContext: string | undefined;
    if ((searchPlan.searchMode === SearchMode.WEB || searchPlan.searchMode === SearchMode.BOTH) && this.hasEngine(SearchEngine.TAVILY)) {
      try { webContext = await searchTavilyLight(keyword); } catch { /* 무시 */ }
    }

    let recruitCtx: string | undefined;
    if (searchPlan.searchMode === SearchMode.RECRUIT || searchPlan.searchMode === SearchMode.BOTH) {
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
      : PROMPTS.lightResearchCloud(topic, searchContext);

    const raw = await this.callAI(model, fullPrompt, opts?.customSystem);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const rawTasks = JSON.parse(jsonMatch[0]);
    const tasks = rawTasks.map((task: { prompt: string; [key: string]: any }) => ({
      ...task,
      webSearchPrompt: task.prompt,
      prompt: undefined,
    }));

    return { tasks, searchContext, fullPrompt, searchPlan };
  }

  /**
   * 큐에서 호출하는 awaitable 래퍼.
   * onEvent 콜백으로 이벤트를 전달받아 Subject 등에 푸시할 수 있다.
   */
  async run(
    topic: string,
    localAIModel: string,
    cloudAIModel: string,
    webModel: SearchEngine,
    searchMode: SearchModeInput = PlannerMode.AUTO,
    searchId?: string,
    onEvent?: (event: LightResearchEvent) => void,
  ): Promise<{ tasks: any[]; searchPlan: SearchPlan }> {
    for await (const event of this.runStream(topic, localAIModel, cloudAIModel, webModel, searchMode, searchId)) {

      if (event.type === LightResearchEventType.SAVEDB) {
        if (event.action === 'recruit') {
          
          Promise.all(
            event.jobs.map((job) =>
              this.researchRecruitRepository.save({
                id: randomUUID(),
                lightResearchId: event.searchId,
                topic: job.title ?? null,
                detail: job.company ?? null,
                location: job.location ?? null,
                description: job.description ?? null,
                skills: job.skills?.length ? job.skills.join(', ') : null,
                url: job.url ?? null,
                recruitCreatedAt: new Date().toISOString(),
              }),
            ),
          ).catch(() => {});

        } else if (event.action === 'searchList') {
          
          Promise.all(
            event.tasks.map((task) =>
              this.searchListRepository.save({
                id: randomUUID(),
                lightResearchId: event.searchId,
                topic: task.title,
                prompt: task.prompt,
              }),
            ),
          ).catch(() => {});
        }

        continue;
      }
      onEvent?.(event);
      if (event.type === LightResearchEventType.DONE) {
        return { tasks: event.tasks, searchPlan: event.searchPlan };
      }
    }
    throw new Error('LightResearch 결과를 받지 못했습니다.');
  }

  // *********** //
  // 파이프라인 실행 //
  // *********** //
  async *runStream(
    topic: string,
    localAIModel: string,
    cloudAIModel: string,
    webModel: SearchEngine,
    searchMode: SearchModeInput = PlannerMode.AUTO,
    searchId?: string,
  ): AsyncGenerator<LightResearchEvent> {
    const model = cloudAIModel || localAIModel;
    const searchPlan = yield* this.step0Plan(topic, localAIModel, searchMode);

    let webContext: string | undefined;
    if ((searchPlan.searchMode === SearchMode.WEB || searchPlan.searchMode === SearchMode.BOTH) && this.hasEngine(webModel)) {
      webContext = yield* this.step1aWebSearch(searchPlan.keyword, webModel);
    }

    let recruitCtx: string | undefined;
    if (searchPlan.searchMode === SearchMode.RECRUIT || searchPlan.searchMode === SearchMode.BOTH) {
      recruitCtx = yield* this.step1bRecruitSearch(searchPlan.companyTypes, searchPlan.jobTypes, searchPlan.keyword, searchId);
    }

    yield* this.step2GenerateTasks(topic, model, searchPlan, webContext, recruitCtx, searchId);
  }

  // ── Step 0: 검색 소스 결정 ──
  async *step0Plan(
    topic: string,
    localAIModel: string,
    searchMode: SearchModeInput = PlannerMode.AUTO,
  ): AsyncGenerator<LightResearchEvent, SearchPlan> {
    yield* this.printFront(`검색 소스 결정 중...`);

    const searchPlan: SearchPlan = searchMode === PlannerMode.AUTO
      ? await this.planner.plan(topic, localAIModel)
      : { searchMode, reason: '수동 지정', keyword: topic };

    if (searchPlan.model) {
      yield* this.printFront(`플래에 사용된 모델: ${searchPlan.model}`);
      yield* this.printFront(`플랜 결과: ${searchPlan.searchMode}`);
      yield* this.printFront(`서칭 키워드: ${searchPlan.keyword}`);
    } else {
      this.logger.warn(`검색 계획 생성에 실패했습니다. searchPlan: ${JSON.stringify(searchPlan)}`);
    }

    return searchPlan;
  }

  // ── Step 1a: 웹 검색 ──
  async *step1aWebSearch(
    searchKeyword: string,
    webModel: SearchEngine,
  ): AsyncGenerator<LightResearchEvent, string | undefined> {
    
    yield* this.printFront(`웹 검색을 시작하겠습니다. 잠시만 기다려주세요. (엔진: ${webModel || 'auto'})`);
    try {
      const webContext = await this.searchWithEngine(webModel, searchKeyword);
      const lines = webContext?.split('\n').length ?? 0;
      yield* this.printFront(`웹 검색 완료 — ${lines}줄 수집`);
      return webContext;
    } catch (err) {
      this.logger.warn(`웹 검색 실패 (무시됨): ${err}`);
      yield* this.printFront('웹 검색 실패 (무시됨)');
      return undefined;
    }
  }

  // ── Step 1b: 채용 공고 검색 ──
  async *step1bRecruitSearch(
    searchCompanyTypes: string[] | undefined,
    searchJobTypes: string[] | undefined,
    keyword: string,
    searchId?: string,
  ): AsyncGenerator<LightResearchEvent, string | undefined> {
    
    yield* this.printFront(`채용 공고 검색을 시작하겠습니다. 잠시만 기다려주세요.`);
    const filterDesc = [
      searchCompanyTypes?.length ? `기업유형: ${searchCompanyTypes.join(', ')}` : '',
      searchJobTypes?.length ? `경력: ${searchJobTypes.join(', ')}` : '',
    ].filter(Boolean).join(' / ');
    yield* this.printFront(`검색 키워드: ${keyword}${filterDesc ? ` / ${filterDesc}` : ''}`);

    let recruitCtx: string | undefined;
    for await (const event of this.recruitContext.liveSearch({ keyword, companyTypes: searchCompanyTypes, jobTypes: searchJobTypes })) {
      if (event.type === LightResearchEventType.LOG) yield* this.printFront(event.message);
      else if (event.type === LightResearchEventType.JOBS) {
        yield { type: LightResearchEventType.JOBS, jobs: event.jobs };
        if (searchId) {
          yield { type: LightResearchEventType.SAVEDB, action: 'recruit' as const, searchId, jobs: event.jobs };
        }
      }
      else if (event.type === 'result' && event.result) recruitCtx = event.result;
    }
    return recruitCtx;
  }

  // ── Step 2: AI 태스크 생성 ──
  async *step2GenerateTasks(
    topic: string,
    model: string,
    searchPlan: SearchPlan,
    webContext: string | undefined,
    recruitCtx: string | undefined,
    searchId?: string,
  ): AsyncGenerator<LightResearchEvent> {
    yield* this.printFront(`AI 검색 실행을 시작하겠습니다. 잠시만 기다려주세요.`);
    yield* this.printFront(`사용된 모델: ${model}`);

    const parts = [webContext, recruitCtx].filter(Boolean) as string[];
    const searchContext = parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;

    const fullPrompt = PROMPTS.lightResearchCloud(topic, searchContext);
    
      const promptChars = fullPrompt.length;
    const approxTokens = Math.round(promptChars / 4);
    const inputCostPer1M = this.aiProvier.getInputCostPer1M(model);
    const estimatedCost = inputCostPer1M != null
      ? ` / 입력 비용 약 $${((approxTokens / 1_000_000) * inputCostPer1M).toFixed(5)}`
      : '';
    yield* this.printFront(`프롬프트 크기: ${promptChars.toLocaleString()}자 / 약 ${approxTokens.toLocaleString()} 토큰${estimatedCost}`);

    const raw = await this.callAI(model, fullPrompt);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);

    yield* this.printFront(`AI 응답 — 태스크 ${tasks.length}개 파싱 완료`);

    if (searchId) {
      yield { type: LightResearchEventType.SAVEDB, action: 'searchList' as const, searchId, tasks };
    }

    const mappedTasks = tasks.map((task: { title: string; prompt: string; [key: string]: any }) => ({
      ...task,
      webSearchPrompt: task.prompt,
      prompt: undefined,
    }));

    yield { type: LightResearchEventType.DONE, tasks: mappedTasks, searchPlan };
  }

  
  private *printFront(message: string): Generator<LightResearchEvent> {
    yield { type: LightResearchEventType.LOG, message };
  }

  private hasEngine(engine: SearchEngine): boolean {
    switch (engine) {
      case SearchEngine.SERPER: return !!process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.startsWith('your_');
      case SearchEngine.NAVER:  return !!process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_ID.startsWith('your_');
      case SearchEngine.BRAVE:  return !!process.env.BRAVE_API_KEY && !process.env.BRAVE_API_KEY.startsWith('your_');
      default:                  return !!process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_');
    }
  }

  private async searchWithEngine(engine: SearchEngine, keyword: string): Promise<string> {
    switch (engine) {
      case SearchEngine.SERPER: return searchSerper(keyword);
      case SearchEngine.NAVER:  return searchNaver(keyword);
      case SearchEngine.BRAVE:  return searchBrave(keyword);
      default:                  return searchTavilyLight(keyword);
    }
  }

  private async callAI(model: string, prompt: string, systemOverride?: string): Promise<string> {
    const system = systemOverride ?? PROMPTS.system;
    const providerType = getProvider(model);
    const provider = providerType === AIProvider.OLLAMA
      ? `${AIProvider.OLLAMA} (${model.slice(AI_MODEL_PREFIX.OLLAMA.length)})`
      : providerType;
    this.logger.log(`[태스크 생성] ${provider} — model=${model}`);
    return this.aiProvier.call(model, system, prompt);
  }
}
