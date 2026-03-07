import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { searchTavilyLight } from '../../infrastructure/search/tavily.search';
import { searchSerper } from '../../infrastructure/search/serper.search';
import { searchNaver } from '../../infrastructure/search/naver.search';
import { searchBrave } from '../../infrastructure/search/brave.search';
import { SearchPlannerService, SearchPlan, SearchSource } from '../search-planner.service';
import { RecruitContextService } from '../../../recruit/application/recruit-context.service';
import { AiClientService } from '../../../ai/application/ai-client.service';
import { SearchListRepository } from '../../domain/repository/search-list.repository';
import { ResearchRecruitRepository } from '../../domain/repository/research-recruit.repository';

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
    private readonly searchListRepository: SearchListRepository,
    private readonly researchRecruitRepository: ResearchRecruitRepository,
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
    if ((source === 'web' || source === 'both') && this.hasEngine('tavily')) {
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
    localAIModel: string,
    cloudAIModel: string,
    webModel: string,
    searchMode: SearchSource | 'auto' = 'auto',
    searchId?: string,
  ): AsyncGenerator<LightResearchEvent> {
    const model = cloudAIModel || localAIModel;

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
    if ((source === 'web' || source === 'both') && this.hasEngine(webModel)) {
      yield* this.printFront(`웹 검색을 시작하겠습니다. 잠시만 기다려주세요. (엔진: ${webModel || 'auto'})`);

      try {
        webContext = await this.searchWithEngine(webModel, keyword);
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
        else if (event.type === 'jobs') {
          yield { type: 'jobs', jobs: event.jobs };
          if (searchId) {
            Promise.all(
              event.jobs.map((job) =>
                this.researchRecruitRepository.save({
                  id: randomUUID(),
                  lightResearchId: searchId,
                  topic: `${job.title} — ${job.company}`,
                  detail: JSON.stringify({ location: job.location, description: job.description, skills: job.skills, url: job.url }),
                  recruitCreatedAt: new Date().toISOString(),
                }),
              ),
            ).catch(() => {});
          }
        }
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

    if (searchId) {
      Promise.all(
        tasks.map((task: { title: string; prompt: string }) =>
          this.searchListRepository.save({
            id: randomUUID(),
            lightResearchId: searchId,
            topic: task.title,
            prompt: task.prompt,
          }),
        ),
      ).catch(() => {});
    }

    yield { type: 'done', tasks, searchPlan };
  }

  private *printFront(message: string): Generator<LightResearchEvent> {
    yield { type: 'log', message };
  }

  private hasEngine(engine: string): boolean {
    switch (engine) {
      case 'serper': return !!process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.startsWith('your_');
      case 'naver':  return !!process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_ID.startsWith('your_');
      case 'brave':  return !!process.env.BRAVE_API_KEY && !process.env.BRAVE_API_KEY.startsWith('your_');
      default:       return !!process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_');
    }
  }

  private async searchWithEngine(engine: string, keyword: string): Promise<string> {
    switch (engine) {
      case 'serper': return searchSerper(keyword);
      case 'naver':  return searchNaver(keyword);
      case 'brave':  return searchBrave(keyword);
      default:       return searchTavilyLight(keyword);
    }
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
