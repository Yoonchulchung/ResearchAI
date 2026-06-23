import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LIGHT_RESEARCH_PROMPTS as PROMPTS } from 'src/research/domain/prompt/research.prompts';
import { searchTavilyLight } from 'src/research/infrastructure/search/tavily.search';
import { searchSerper } from 'src/research/infrastructure/search/serper.search';
import { searchNaver } from 'src/research/infrastructure/search/naver.search';
import { searchBrave } from 'src/research/infrastructure/search/brave.search';
import {
  SearchPlannerService,
  SearchModeInput,
} from 'src/research/application/search-planner.service';
import {
  SearchPlan,
  SearchMode,
  PlannerMode,
  SearchEngine,
  isBuiltinSearchEngine,
} from 'src/research/domain/model/search-planner.model';
import {
  AIProvider,
  AI_MODEL_PREFIX,
  getProvider,
} from 'src/ai/domain/models';
import { RecruitContextService } from 'src/recruit/application/recruit-context.service';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import {
  VlmMessage,
  ImageContentBlock,
} from 'src/ai/infrastructure/ai-provider.service';
import { SearchListRepository } from 'src/research/domain/repository/search-list.repository';
import { ResearchRecruitRepository } from 'src/research/domain/repository/research-recruit.repository';
import { LightResearchEventType } from 'src/research/domain/model/light-research.model';
import { AttachedFilePayload } from 'src/queue/presentation/dto/request/enqueue-light-research.dto';
import { BrowserService } from 'src/browse/application/browser.service';
import { NewsService } from 'src/news/application/service/news.service';

export type JobItem = {
  title: string;
  company: string;
  location?: string | null;
  description?: string | null;
  skills: string[];
  url: string;
};

export type LightResearchEvent =
  | { type: LightResearchEventType.START }
  | {
      type: LightResearchEventType.PLAN;
      searchMode: SearchMode;
      reason: string;
    }
  | { type: LightResearchEventType.LOG; message: string }
  | { type: LightResearchEventType.JOBS; jobs: JobItem[] }
  | { type: LightResearchEventType.GENERATING; model: string }
  | {
      type: LightResearchEventType.DONE;
      tasks: any[];
      searchPlan: SearchPlan;
      searchId?: string;
    }
  | {
      type: LightResearchEventType.SAVEDB;
      action: 'recruit';
      searchId: string;
      jobs: JobItem[];
    }
  | {
      type: LightResearchEventType.SAVEDB;
      action: 'searchList';
      searchId: string;
      tasks: { title: string; prompt: string }[];
    };

/**
 * LightResearch 파이프라인
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Step 0. 검색 소스 결정 (searchMode)                               │
 * │          auto → Ollama 라우터가 web / recruit / both 판단           │
 * │          직접 지정 → 지정값 사용                                     │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  Step 1a. 웹 검색 (web / both, Puppeteer 내장 엔진)                  │
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
    private readonly browser: BrowserService,
    private readonly newsService: NewsService,
  ) {}

  /** 파이프라인 테스트용 — fullPrompt, searchContext, searchPlan 포함 반환 */
  async testRun(
    topic: string,
    model: string,
    opts?: {
      customPrompt?: string;
      customSystem?: string;
      searchMode?: SearchModeInput;
    },
  ) {
    const searchMode = opts?.searchMode ?? PlannerMode.AUTO;
    const searchPlan: SearchPlan =
      searchMode === PlannerMode.AUTO
        ? await this.planner.plan(topic)
        : { searchMode, reason: '수동 지정', keyword: topic };

    const { keyword } = searchPlan;

    let webContext: string | undefined;
    if (
      searchPlan.searchMode === SearchMode.WEB ||
      searchPlan.searchMode === SearchMode.BOTH
    ) {
      try {
        const [webRaw, newsRaw] = await Promise.allSettled([
          this.browser.searchWeb(keyword, 10),
          this.newsService.getQueryNews(keyword, 1).catch(() => ({ items: [] })),
        ]);
        const webItems = webRaw.status === 'fulfilled' ? webRaw.value : [];
        const newsItems = newsRaw.status === 'fulfilled' ? newsRaw.value.items : [];
        const seen = new Set(newsItems.map((n) => n.url));
        const all = [...newsItems, ...webItems.filter((w) => !seen.has(w.url))];
        if (all.length > 0) {
          webContext = all
            .map((item, i) => {
              const date = 'publishedAt' in item && item.publishedAt ? ` (${String(item.publishedAt).substring(0, 10)})` : '';
              return `[${i + 1}] ${item.title}${date}\n${item.snippet ?? ''}\n출처: ${item.url}`;
            })
            .join('\n\n');
        }
      } catch {
        /* 무시 */
      }
    }

    let recruitCtx: string | undefined;
    if (
      searchPlan.searchMode === SearchMode.RECRUIT ||
      searchPlan.searchMode === SearchMode.BOTH
    ) {
      for await (const event of this.recruitContext.liveSearch({
        keyword,
        companyTypes: searchPlan.companyTypes,
        jobTypes: searchPlan.jobTypes,
      })) {
        if (event.type === 'result' && event.result) recruitCtx = event.result;
      }
    }

    const parts = [webContext, recruitCtx].filter(Boolean) as string[];
    const searchContext =
      parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;

    const fullPrompt = opts?.customPrompt
      ? opts.customPrompt
          .replaceAll('{{topic}}', topic)
          .replaceAll('{{searchContext}}', searchContext ?? '')
      : PROMPTS.taskList(topic, searchContext);

    const raw = await this.callAI(model, fullPrompt, opts?.customSystem);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const rawTasks = JSON.parse(jsonMatch[0]);
    const tasks = rawTasks.map(
      (task: { prompt: string; [key: string]: any }) => ({
        ...task,
        webSearchPrompt: task.prompt,
        prompt: undefined,
      }),
    );

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
    attachedFiles?: AttachedFilePayload[],
  ): Promise<{ tasks: any[]; searchPlan: SearchPlan }> {
    for await (const event of this.runStream(
      topic,
      localAIModel,
      cloudAIModel,
      webModel,
      searchMode,
      searchId,
      attachedFiles,
    )) {
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
    attachedFiles?: AttachedFilePayload[],
  ): AsyncGenerator<LightResearchEvent> {
    const model = cloudAIModel || localAIModel;
    const searchPlan = yield* this.step0Plan(topic, localAIModel, searchMode);

    const useBuiltin = isBuiltinSearchEngine(webModel);

    let webContext: string | undefined;
    if (
      !useBuiltin &&
      (searchPlan.searchMode === SearchMode.WEB ||
        searchPlan.searchMode === SearchMode.BOTH)
    ) {
      // Puppeteer 내장 엔진이므로 API 키 불필요 — hasEngine 체크 제거
      webContext = yield* this.step1aWebSearch(searchPlan.keyword, webModel);
    }

    let recruitCtx: string | undefined;
    if (
      searchPlan.searchMode === SearchMode.RECRUIT ||
      searchPlan.searchMode === SearchMode.BOTH
    ) {
      recruitCtx = yield* this.step1bRecruitSearch(
        searchPlan.companyTypes,
        searchPlan.jobTypes,
        searchPlan.keyword,
        searchId,
      );
    }

    yield* this.step2GenerateTasks(
      topic,
      model,
      searchPlan,
      webContext,
      recruitCtx,
      searchId,
      useBuiltin,
      attachedFiles,
    );
  }

  // ── Step 0: 검색 소스 결정 ──
  async *step0Plan(
    topic: string,
    localAIModel: string,
    searchMode: SearchModeInput = PlannerMode.AUTO,
  ): AsyncGenerator<LightResearchEvent, SearchPlan> {
    yield* this.printFront(`검색 소스 결정 중...`);

    const searchPlan: SearchPlan =
      searchMode === PlannerMode.AUTO
        ? await this.planner.plan(topic, localAIModel)
        : { searchMode, reason: '수동 지정', keyword: topic };

    if (searchPlan.model) {
      yield* this.printFront(`플래에 사용된 모델: ${searchPlan.model}`);
      yield* this.printFront(`플랜 결과: ${searchPlan.searchMode}`);
      yield* this.printFront(`서칭 키워드: ${searchPlan.keyword}`);
    } else {
      this.logger.warn(
        `검색 계획 생성에 실패했습니다. searchPlan: ${JSON.stringify(searchPlan)}`,
      );
    }

    return searchPlan;
  }

  // ── Step 1a: 웹 검색 (다중 엔진 병렬) ──
  async *step1aWebSearch(
    searchKeyword: string,
    webModel: SearchEngine,
  ): AsyncGenerator<LightResearchEvent, string | undefined> {
    yield* this.printFront(`웹 검색 시작 (웹 + 뉴스 병렬)`);
    try {
      const [webRaw, newsRaw] = await Promise.allSettled([
        this.browser.searchWeb(searchKeyword, 10),
        this.newsService.getQueryNews(searchKeyword, 1).catch(() => ({ items: [] })),
      ]);

      const webItems = webRaw.status === 'fulfilled' ? webRaw.value : [];
      const newsItems = newsRaw.status === 'fulfilled' ? newsRaw.value.items : [];

      // URL 기준 중복 제거 — 뉴스 우선(날짜 포함)
      const seen = new Set(newsItems.map((n) => n.url));
      const dedupedWeb = webItems.filter((w) => !seen.has(w.url));

      const allItems = [...newsItems, ...dedupedWeb];

      if (allItems.length === 0) {
        // 폴백: 기존 단일 엔진
        yield* this.printFront(`결과 없음 — ${webModel} 폴백 검색`);
        const fallback = await this.searchWithEngine(webModel, searchKeyword).catch(() => '');
        return fallback || undefined;
      }

      const contextLines = allItems.map((item, i) => {
        const isNews = 'publishedAt' in item;
        const date = isNews && item.publishedAt ? ` (${String(item.publishedAt).substring(0, 10)})` : '';
        const source = 'source' in item ? item.source : '';
        return `[${i + 1}] ${item.title}${date}\n${item.snippet ?? ''}${source ? `\n출처: ${item.url} (${source})` : `\n출처: ${item.url}`}`;
      });

      yield* this.printFront(
        `웹 검색 완료 — 웹 ${dedupedWeb.length}건 + 뉴스 ${newsItems.length}건 (총 ${allItems.length}건)`,
      );
      return contextLines.join('\n\n');
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
    yield* this.printFront(
      `채용 공고 검색을 시작하겠습니다. 잠시만 기다려주세요.`,
    );
    const filterDesc = [
      searchCompanyTypes?.length
        ? `기업유형: ${searchCompanyTypes.join(', ')}`
        : '',
      searchJobTypes?.length ? `경력: ${searchJobTypes.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' / ');
    yield* this.printFront(
      `검색 키워드: ${keyword}${filterDesc ? ` / ${filterDesc}` : ''}`,
    );

    let recruitCtx: string | undefined;
    for await (const event of this.recruitContext.liveSearch({
      keyword,
      companyTypes: searchCompanyTypes,
      jobTypes: searchJobTypes,
    })) {
      if (event.type === LightResearchEventType.LOG)
        yield* this.printFront(event.message);
      else if (event.type === LightResearchEventType.JOBS) {
        yield { type: LightResearchEventType.JOBS, jobs: event.jobs };
        if (searchId) {
          yield {
            type: LightResearchEventType.SAVEDB,
            action: 'recruit' as const,
            searchId,
            jobs: event.jobs,
          };
        }
      } else if (event.type === 'result' && event.result)
        recruitCtx = event.result;
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
    useBuiltinSearch?: boolean,
    attachedFiles?: AttachedFilePayload[],
  ): AsyncGenerator<LightResearchEvent> {
    // 채용 공고 모드: AI 호출 없이 단일 태스크 즉시 반환
    if (searchPlan.searchMode === SearchMode.RECRUIT) {
      yield* this.printFront(`채용 공고 모드 — 태스크 생성 완료`);
      const mappedTasks = [
        { id: 1, title: '채용 공고 검색', webSearchPrompt: searchPlan.keyword },
      ];
      if (searchId) {
        yield {
          type: LightResearchEventType.SAVEDB,
          action: 'searchList' as const,
          searchId,
          tasks: [{ title: '채용 공고 검색', prompt: searchPlan.keyword }],
        };
      }
      yield {
        type: LightResearchEventType.DONE,
        tasks: mappedTasks,
        searchPlan: { ...searchPlan, source: searchPlan.searchMode } as any,
        searchId,
      };
      return;
    }

    yield* this.printFront(
      `AI 검색 실행을 시작하겠습니다. 잠시만 기다려주세요.`,
    );
    yield* this.printFront(`사용된 모델: ${model}`);

    const parts = [webContext, recruitCtx].filter(Boolean) as string[];
    const searchContext =
      parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;

    let fullPrompt = PROMPTS.taskList(topic, searchContext);

    // 첨부 문서(PDF/DOCX) 텍스트를 프롬프트에 추가
    const docTexts = (attachedFiles ?? [])
      .filter((f) => (f.type === 'pdf' || f.type === 'docx') && f.text)
      .map((f) => f.text!);
    if (docTexts.length > 0) {
      fullPrompt += `\n\n## 첨부 문서 내용\n${docTexts.join('\n\n---\n\n')}`;
    }

    const promptChars = fullPrompt.length;
    const approxTokens = Math.round(promptChars / 4);
    const inputCostPer1M = this.aiProvier.getInputCostPer1M(model);
    const estimatedCost =
      inputCostPer1M != null
        ? ` / 입력 비용 약 $${((approxTokens / 1_000_000) * inputCostPer1M).toFixed(5)}`
        : '';
    yield* this.printFront(
      `프롬프트 크기: ${promptChars.toLocaleString()}자 / 약 ${approxTokens.toLocaleString()} 토큰${estimatedCost}`,
    );

    const imageFiles = (attachedFiles ?? []).filter(
      (f) => f.type === 'image' && f.dataUrl && f.mediaType,
    );
    if (imageFiles.length > 0) {
      yield* this.printFront(`첨부 이미지 ${imageFiles.length}개 포함`);
    }

    const raw = await this.callAI(
      model,
      fullPrompt,
      undefined,
      useBuiltinSearch,
      attachedFiles,
    );
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);

    yield* this.printFront(`AI 응답 — 태스크 ${tasks.length}개 파싱 완료`);

    if (searchId) {
      yield {
        type: LightResearchEventType.SAVEDB,
        action: 'searchList' as const,
        searchId,
        tasks,
      };
    }

    const mappedTasks = tasks.map(
      (task: { title: string; prompt: string; [key: string]: any }) => ({
        ...task,
        webSearchPrompt: task.prompt,
        prompt: undefined,
      }),
    );

    yield {
      type: LightResearchEventType.DONE,
      tasks: mappedTasks,
      searchPlan: { ...searchPlan, source: searchPlan.searchMode } as any,
      searchId,
    };
  }

  private *printFront(message: string): Generator<LightResearchEvent> {
    yield { type: LightResearchEventType.LOG, message };
  }

  private async searchWithEngine(
    engine: SearchEngine,
    keyword: string,
  ): Promise<string> {
    switch (engine) {
      case SearchEngine.SERPER:
        return searchSerper(keyword);
      case SearchEngine.NAVER:
        return searchNaver(keyword);
      case SearchEngine.BRAVE:
        return searchBrave(keyword);
      default:
        return searchTavilyLight(keyword);
    }
  }

  private async callAI(
    model: string,
    prompt: string,
    systemOverride?: string,
    useBuiltinSearch?: boolean,
    attachedFiles?: AttachedFilePayload[],
  ): Promise<string> {
    const system = systemOverride ?? PROMPTS.system;
    const providerType = getProvider(model);
    const provider =
      providerType === AIProvider.OLLAMA
        ? `${AIProvider.OLLAMA} (${model.slice(AI_MODEL_PREFIX.OLLAMA.length)})`
        : providerType;
    this.logger.log(`[태스크 생성] ${provider} — model=${model}`);

    const imageBlocks: ImageContentBlock[] = (attachedFiles ?? [])
      .filter((f) => f.type === 'image' && f.dataUrl && f.mediaType)
      .map((f) => {
        const base64 = f.dataUrl!.includes(',')
          ? f.dataUrl!.split(',')[1]
          : f.dataUrl!;
        return {
          type: 'image' as const,
          mediaType: f.mediaType as ImageContentBlock['mediaType'],
          data: base64,
        };
      });

    if (imageBlocks.length > 0) {
      const messages: VlmMessage[] = [
        { role: 'user', content: [prompt, ...imageBlocks] },
      ];
      let result = '';
      for await (const chunk of this.aiProvier.stream(
        model,
        system,
        messages,
      )) {
        result += chunk;
      }
      return result;
    }

    return (
      await this.aiProvier.call(model, system, prompt, { useBuiltinSearch })
    ).text;
  }
}
