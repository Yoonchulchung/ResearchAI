import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { HotPaperEntity } from '../domain/entity/hot-paper.entity';
import { HotPaperTrendSummaryEntity } from '../domain/entity/hot-paper-trend-summary.entity';
import { ContentRefreshStateEntity } from '../../../shared/entity/content-refresh-state.entity';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';
import { AppConfigService, CONFIG_KEYS } from '../../../config/application/app-config.service';

export interface HotPaperSource {
  id: string;
  name: string;
  url: string;
}

export interface HotPaper {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  authors: string[];
  publishedAt?: string;
  venue?: string;
  upvotes?: number;
  pdfUrl?: string;
  codeUrl?: string;
  tags: string[];
  aiSummary?: string;
  aiSummaryModel?: string;
  aiSummaryAt?: string;
}

export interface HotPaperListResult {
  sources: HotPaperSource[];
  papers: HotPaper[];
  errors: { sourceId: string; message: string }[];
  fetchedAt: string;
}

export interface HotPaperTrendKeyword {
  keyword: string;
  count: number;
}

export interface HotPaperTrendSummary {
  summary: string;
  keywords: HotPaperTrendKeyword[];
  paperCount: number;
  sourceCount: number;
  generatedAt: string;
  cached: boolean;
  model: string;
}

const TREND_CACHE_MS = 6 * 60 * 60 * 1000;
const TREND_STOPWORDS = new Set([
  'the', 'and', 'for', 'of', 'to', 'in', 'on', 'a', 'an', 'is', 'are', 'be', 'by', 'with',
  'from', 'that', 'this', 'into', 'using', 'about', 'based', 'how', 'via', 'over', 'our',
  'we', 'we', 'its', 'their', 'large', 'new', 'model', 'models', 'learning',
]);

const SOURCES: HotPaperSource[] = [
  { id: 'huggingface-trending', name: 'Hugging Face Trending Papers', url: 'https://huggingface.co/papers' },
  { id: 'openreview-iclr', name: 'ICLR (OpenReview)', url: 'https://openreview.net/group?id=ICLR.cc/2025/Conference' },
  { id: 'openreview-icml', name: 'ICML (OpenReview)', url: 'https://openreview.net/group?id=ICML.cc/2025/Conference' },
  { id: 'openreview-neurips', name: 'NeurIPS (OpenReview)', url: 'https://openreview.net/group?id=NeurIPS.cc/2025/Conference' },
  { id: 'dblp-cvpr', name: 'CVPR (DBLP)', url: 'https://dblp.org/db/conf/cvpr/' },
  { id: 'dblp-acl', name: 'ACL (DBLP)', url: 'https://dblp.org/db/conf/acl/' },
  { id: 'dblp-emnlp', name: 'EMNLP (DBLP)', url: 'https://dblp.org/db/conf/emnlp/' },
  { id: 'dblp-aaai', name: 'AAAI (DBLP)', url: 'https://dblp.org/db/conf/aaai/' },
  { id: 'dblp-kdd', name: 'KDD (DBLP)', url: 'https://dblp.org/db/conf/kdd/' },
  { id: 'dblp-isca', name: 'ISCA (DBLP)', url: 'https://dblp.org/db/conf/isca/' },
  { id: 'dblp-micro', name: 'MICRO (DBLP)', url: 'https://dblp.org/db/conf/micro/' },
  { id: 'dblp-asplos', name: 'ASPLOS (DBLP)', url: 'https://dblp.org/db/conf/asplos/' },
  { id: 'dblp-hpca', name: 'HPCA (DBLP)', url: 'https://dblp.org/db/conf/hpca/' },
  { id: 'dblp-fast', name: 'FAST (DBLP)', url: 'https://dblp.org/db/conf/fast/' },
  { id: 'dblp-sigmod', name: 'SIGMOD (DBLP)', url: 'https://dblp.org/db/conf/sigmod/' },
  { id: 'dblp-vldb', name: 'VLDB (DBLP)', url: 'https://dblp.org/db/conf/vldb/' },
];

const OPENREVIEW_CONFERENCES: Record<string, { shortName: string; venuePrefix: string }> = {
  'openreview-iclr': { shortName: 'ICLR', venuePrefix: 'ICLR.cc' },
  'openreview-icml': { shortName: 'ICML', venuePrefix: 'ICML.cc' },
  'openreview-neurips': { shortName: 'NeurIPS', venuePrefix: 'NeurIPS.cc' },
};

const DBLP_CONFERENCES: Record<string, { shortName: string; stream: string; tags: string[] }> = {
  'dblp-cvpr': { shortName: 'CVPR', stream: 'conf/cvpr', tags: ['Computer Vision', 'AI'] },
  'dblp-acl': { shortName: 'ACL', stream: 'conf/acl', tags: ['NLP', 'AI'] },
  'dblp-emnlp': { shortName: 'EMNLP', stream: 'conf/emnlp', tags: ['NLP', 'AI'] },
  'dblp-aaai': { shortName: 'AAAI', stream: 'conf/aaai', tags: ['AI'] },
  'dblp-kdd': { shortName: 'KDD', stream: 'conf/kdd', tags: ['Data Mining', 'AI'] },
  'dblp-isca': { shortName: 'ISCA', stream: 'conf/isca', tags: ['Computer Architecture', 'Memory Systems'] },
  'dblp-micro': { shortName: 'MICRO', stream: 'conf/micro', tags: ['Microarchitecture', 'Memory Systems'] },
  'dblp-asplos': { shortName: 'ASPLOS', stream: 'conf/asplos', tags: ['Architecture', 'Operating Systems', 'Memory Systems'] },
  'dblp-hpca': { shortName: 'HPCA', stream: 'conf/hpca', tags: ['Computer Architecture', 'Memory Systems'] },
  'dblp-fast': { shortName: 'FAST', stream: 'conf/fast', tags: ['Storage Systems', 'Memory Systems'] },
  'dblp-sigmod': { shortName: 'SIGMOD', stream: 'conf/sigmod', tags: ['Database', 'Data Systems'] },
  'dblp-vldb': { shortName: 'VLDB', stream: 'conf/vldb', tags: ['Database', 'Data Systems'] },
};

const REQUEST_TIMEOUT_MS = 15_000;
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 60 * 60 * 1000;
const REFRESH_STATE_KEY = 'content-refresh:hot-papers';
const DEFAULT_AI_SUMMARY_MODEL = 'claude-haiku-4-5-20251001';
const OPENREVIEW_PAGE_SIZE = 200;
const OPENREVIEW_MAX_PER_YEAR = 600;
const OPENREVIEW_YEAR_WINDOW = 4;
const DBLP_RESULT_LIMIT = 80;
const MIN_SOURCE_CACHE_COUNT = 20;

type DblpAuthor = string | { text?: string; '@pid'?: string };
type DblpHit = {
  info?: {
    title?: string;
    authors?: { author?: DblpAuthor | DblpAuthor[] };
    venue?: string;
    year?: string;
    type?: string;
    url?: string;
    doi?: string;
    ee?: string | string[];
  };
};

@Injectable()
export class HotPapersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HotPapersService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<HotPaperListResult['errors']> | null = null;
  private sourceRefreshPromises = new Map<string, Promise<HotPaperListResult['errors']>>();
  private trendCache: { key: string; expiresAt: number; value: HotPaperTrendSummary } | null = null;

  constructor(
    @InjectRepository(HotPaperEntity)
    private readonly paperRepo: Repository<HotPaperEntity>,
    @InjectRepository(HotPaperTrendSummaryEntity)
    private readonly trendRepo: Repository<HotPaperTrendSummaryEntity>,
    @InjectRepository(ContentRefreshStateEntity)
    private readonly refreshStateRepo: Repository<ContentRefreshStateEntity>,
    private readonly aiProvider: AiProviderService,
    private readonly appConfig: AppConfigService,
  ) {}

  onModuleInit() {
    setTimeout(() => {
      this.refreshCacheIfStale().catch((error) => {
        const message = error instanceof Error ? error.message : '핫 논문 자동 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }, 8_000);

    this.refreshTimer = setInterval(() => {
      this.refreshCacheIfStale().catch((error) => {
        const message = error instanceof Error ? error.message : '핫 논문 자동 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }, REFRESH_CHECK_MS);
    this.refreshTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async getPapers(options: { source?: string; limit?: number; refresh?: boolean } = {}): Promise<HotPaperListResult> {
    let errors: HotPaperListResult['errors'] = [];
    const cachedCount = await this.paperRepo.count();
    const requestedSource = options.source && options.source !== 'all' ? options.source : undefined;
    const requestedSourceCount = requestedSource
      ? await this.paperRepo.count({ where: { sourceId: requestedSource } })
      : 0;

    if (requestedSource && (options.refresh || requestedSourceCount < MIN_SOURCE_CACHE_COUNT)) {
      errors = await this.refreshSourceCache(requestedSource);
    } else if (!requestedSource && (options.refresh || cachedCount === 0)) {
      errors = await this.refreshCache();
    } else if (requestedSource) {
      this.refreshSourceCacheIfStale(requestedSource).catch((error) => {
        const message = error instanceof Error ? error.message : '핫 논문 출처별 백그라운드 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    } else {
      this.refreshCacheIfStale().catch((error) => {
        const message = error instanceof Error ? error.message : '핫 논문 백그라운드 수집에 실패했습니다.';
        this.logger.warn(message);
      });
    }

    const result: HotPaperListResult = {
      sources: SOURCES,
      papers: await this.readCachedPapers(),
      errors,
      fetchedAt: (await this.getLastRefreshAt()) ?? new Date(0).toISOString(),
    };

    return this.filterResult(result, options.source, options.limit);
  }

  async summarizePaper(
    id: string,
    options: { model?: string; refresh?: boolean } = {},
  ): Promise<{ id: string; aiSummary: string; aiSummaryModel: string; aiSummaryAt: string; cached: boolean }> {
    const paper = await this.paperRepo.findOne({ where: { id } });
    if (!paper) throw new Error('논문을 찾을 수 없습니다.');

    const model = options.model?.trim() || DEFAULT_AI_SUMMARY_MODEL;
    if (!options.refresh && paper.aiSummary && paper.aiSummaryModel === model && paper.aiSummaryAt) {
      return {
        id,
        aiSummary: paper.aiSummary,
        aiSummaryModel: paper.aiSummaryModel,
        aiSummaryAt: paper.aiSummaryAt,
        cached: true,
      };
    }

    const hotPaper = this.toPaper(paper);
    const system = `당신은 AI/ML 최신 논문을 한국어로 읽기 쉽게 설명하는 연구 애널리스트입니다.
제공된 논문 메타데이터와 초록에 없는 내용은 만들지 말고, 실무자와 연구자가 빠르게 판단할 수 있게 요약하세요.`;
    const prompt = this.buildAiSummaryPrompt(hotPaper);
    const { text } = await this.aiProvider.call(model, system, prompt, { caller: 'hot-paper-ai-summary' });
    const aiSummary = text.trim();
    const aiSummaryAt = new Date().toISOString();

    paper.aiSummary = aiSummary;
    paper.aiSummaryModel = model;
    paper.aiSummaryAt = aiSummaryAt;
    await this.paperRepo.save(paper);

    return { id, aiSummary, aiSummaryModel: model, aiSummaryAt, cached: false };
  }

  async findById(id: string): Promise<HotPaper | null> {
    const entity = await this.paperRepo.findOne({ where: { id } });
    return entity ? this.toPaper(entity) : null;
  }

  async fetchPdfBuffer(id: string): Promise<{ buffer: Buffer; filename: string } | null> {
    const entity = await this.paperRepo.findOne({ where: { id } });
    if (!entity?.pdfUrl) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(entity.pdfUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ResearchAI-PaperProxy/1.0',
          'Accept': 'application/pdf,*/*',
        },
      });
      if (!res.ok) throw new Error(`PDF proxy HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const filename = `${id.replace(/[:/\\]/g, '_')}.pdf`;
      return { buffer, filename };
    } finally {
      clearTimeout(timeout);
    }
  }

  async getTrendSummary(options: { model?: string; refresh?: boolean; onChunk?: (chunk: string) => void } = {}): Promise<HotPaperTrendSummary> {
    const model = options.model || await this.appConfig.get(CONFIG_KEYS.DEFAULT_CLOUD_MODEL, 'claude-haiku-4-5-20251001');
    const papers = await this.readCachedPapers();
    const keywords = this.extractTrendKeywords(papers).slice(0, 20);
    const cacheKey = this.trendCacheKey({ model, papers });
    const now = Date.now();

    if (!options.refresh && this.trendCache?.key === cacheKey && this.trendCache.expiresAt > now) {
      return { ...this.trendCache.value, cached: true };
    }

    if (!options.refresh) {
      const stored = await this.readStoredTrendSummary(cacheKey, now);
      if (stored) {
        this.trendCache = { key: cacheKey, expiresAt: stored.expiresAtMs, value: stored.value };
        return { ...stored.value, cached: true };
      }
    }

    if (papers.length === 0) {
      const value: HotPaperTrendSummary = {
        summary: '분석할 논문이 없습니다. 먼저 새로고침으로 논문을 수집해 주세요.',
        keywords,
        paperCount: 0,
        sourceCount: 0,
        generatedAt: new Date().toISOString(),
        cached: false,
        model,
      };
      await this.storeTrendSummary(cacheKey, value);
      return value;
    }

    const sourceCount = new Set(papers.map((p) => p.sourceId)).size;
    const prompt = this.buildTrendPrompt(papers, keywords);
    const systemPrompt = '당신은 AI/ML 최신 논문을 분석하는 연구 트렌드 애널리스트입니다. 제공된 논문 목록에서 반복적으로 등장하는 연구 주제, 방법론, 키워드를 근거로 현재 학계의 흐름을 한국어로 요약합니다.';

    let text: string;
    if (options.onChunk) {
      const onChunk = options.onChunk;
      text = '';
      for await (const chunk of this.aiProvider.stream(model, systemPrompt, [{ role: 'user', content: prompt }])) {
        text += chunk;
        onChunk(chunk);
      }
    } else {
      ({ text } = await this.aiProvider.call(model, systemPrompt, prompt, { caller: 'hot-paper-trend-summary' }));
    }

    const value: HotPaperTrendSummary = {
      summary: text.trim(),
      keywords,
      paperCount: papers.length,
      sourceCount,
      generatedAt: new Date().toISOString(),
      cached: false,
      model,
    };
    this.trendCache = { key: cacheKey, expiresAt: Date.now() + TREND_CACHE_MS, value };
    await this.storeTrendSummary(cacheKey, value);
    return value;
  }

  async getLatestStoredTrendSummary(options: { model?: string } = {}): Promise<HotPaperTrendSummary | null> {
    const candidates = await this.trendRepo.find({
      order: { generatedAt: 'DESC' },
      take: 20,
    });

    const model = options.model?.trim();
    const entity = candidates.find((item) => {
      if (!model) return true;
      return item.model === model;
    });
    if (!entity) return null;

    return {
      summary: entity.summary,
      keywords: this.parseTrendKeywords(entity.keywordsJson),
      paperCount: entity.paperCount,
      sourceCount: entity.sourceCount,
      generatedAt: entity.generatedAt,
      cached: true,
      model: entity.model,
    };
  }

  private async refreshCacheIfStale(): Promise<void> {
    const lastRefreshAt = await this.getLastRefreshAt();
    const empty = (await this.paperRepo.count()) === 0;
    if (!empty && lastRefreshAt && Date.now() - new Date(lastRefreshAt).getTime() < DAILY_REFRESH_MS) return;
    await this.refreshCache();
  }

  private async needsSourceRefresh(source?: string): Promise<boolean> {
    if (!source || source === 'all') return false;
    if (!SOURCES.some((item) => item.id === source)) return false;
    const count = await this.paperRepo.count({ where: { sourceId: source } });
    if (count >= MIN_SOURCE_CACHE_COUNT) {
      const lastRefreshAt = await this.getLastSourceRefreshAt(source);
      return !lastRefreshAt || Date.now() - new Date(lastRefreshAt).getTime() >= DAILY_REFRESH_MS;
    }

    const lastAttemptAt = await this.getLastSourceRefreshAt(source);
    if (!lastAttemptAt) return true;
    return Date.now() - new Date(lastAttemptAt).getTime() >= REFRESH_CHECK_MS;
  }

  private async refreshSourceCacheIfStale(sourceId: string): Promise<void> {
    if (!(await this.needsSourceRefresh(sourceId))) return;
    await this.refreshSourceCache(sourceId);
  }

  private async refreshCache(): Promise<HotPaperListResult['errors']> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.collectAndStorePapers()
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private getSourceFetchers(): [string, () => Promise<HotPaper[]>][] {
    return [
      ['huggingface-trending', () => this.fetchHuggingFaceTrending()],
      ['openreview-iclr', () => this.fetchOpenReviewConference('openreview-iclr')],
      ['openreview-icml', () => this.fetchOpenReviewConference('openreview-icml')],
      ['openreview-neurips', () => this.fetchOpenReviewConference('openreview-neurips')],
      ['dblp-cvpr', () => this.fetchDblpConference('dblp-cvpr')],
      ['dblp-acl', () => this.fetchDblpConference('dblp-acl')],
      ['dblp-emnlp', () => this.fetchDblpConference('dblp-emnlp')],
      ['dblp-aaai', () => this.fetchDblpConference('dblp-aaai')],
      ['dblp-kdd', () => this.fetchDblpConference('dblp-kdd')],
      ['dblp-isca', () => this.fetchDblpConference('dblp-isca')],
      ['dblp-micro', () => this.fetchDblpConference('dblp-micro')],
      ['dblp-asplos', () => this.fetchDblpConference('dblp-asplos')],
      ['dblp-hpca', () => this.fetchDblpConference('dblp-hpca')],
      ['dblp-fast', () => this.fetchDblpConference('dblp-fast')],
      ['dblp-sigmod', () => this.fetchDblpConference('dblp-sigmod')],
      ['dblp-vldb', () => this.fetchDblpConference('dblp-vldb')],
    ];
  }

  private async refreshSourceCache(sourceId: string): Promise<HotPaperListResult['errors']> {
    const running = this.sourceRefreshPromises.get(sourceId);
    if (running) return running;

    const source = SOURCES.find((s) => s.id === sourceId);
    const fetcher = this.getSourceFetchers().find(([id]) => id === sourceId)?.[1];
    if (!source || !fetcher) return [{ sourceId, message: '지원하지 않는 논문 출처입니다.' }];

    const promise = (async (): Promise<HotPaperListResult['errors']> => {
      try {
        const papers = await fetcher();
        await this.storePapers(papers);
        const now = new Date().toISOString();
        await this.setLastRefreshAt(now);
        await this.setLastSourceRefreshAt(sourceId, now);
        return [];
      } catch (error) {
        const message = error instanceof Error ? error.message : '논문 수집에 실패했습니다.';
        this.logger.warn(`${source.name} targeted crawl failed: ${message}`);
        await this.setLastSourceRefreshAt(sourceId, new Date().toISOString());
        return [{ sourceId, message }];
      }
    })().finally(() => {
      this.sourceRefreshPromises.delete(sourceId);
    });

    this.sourceRefreshPromises.set(sourceId, promise);
    return promise;
  }

  private async collectAndStorePapers(): Promise<HotPaperListResult['errors']> {
    const fetchers = this.getSourceFetchers();
    const settled = await Promise.allSettled(fetchers.map(([, fn]) => fn()));
    const papers: HotPaper[] = [];
    const errors: HotPaperListResult['errors'] = [];
    const refreshedSourceIds: string[] = [];

    settled.forEach((result, index) => {
      const [sourceId] = fetchers[index];
      const source = SOURCES.find((s) => s.id === sourceId) ?? { id: sourceId, name: sourceId, url: '' };
      if (result.status === 'fulfilled') {
        papers.push(...result.value);
        refreshedSourceIds.push(sourceId);
        return;
      }
      const message = result.reason instanceof Error ? result.reason.message : '논문 수집에 실패했습니다.';
      errors.push({ sourceId: source.id, message });
      this.logger.warn(`${source.name} crawl failed: ${message}`);
    });

    await this.storePapers(papers);
    const now = new Date().toISOString();
    await this.setLastRefreshAt(now);
    await Promise.all(refreshedSourceIds.map((sourceId) => this.setLastSourceRefreshAt(sourceId, now)));
    return errors;
  }

  private async storePapers(papers: HotPaper[]): Promise<void> {
    const deduped = this.dedupe(papers);
    if (deduped.length > 0) {
      const existing = await this.paperRepo.find({
        where: { id: In(deduped.map((paper) => paper.id)) },
      });
      const existingById = new Map(existing.map((paper) => [paper.id, paper]));
      await this.paperRepo.save(deduped.map((paper) => {
        const entity = this.toPaperEntity(paper);
        const previous = existingById.get(paper.id);
        if (previous?.aiSummary) {
          entity.aiSummary = previous.aiSummary;
          entity.aiSummaryModel = previous.aiSummaryModel;
          entity.aiSummaryAt = previous.aiSummaryAt;
        }
        return entity;
      }));
    }
  }

  private async readCachedPapers(): Promise<HotPaper[]> {
    const entities = await this.paperRepo.find({ order: { publishedAt: 'DESC', updatedAt: 'DESC' } });
    return entities
      .map((entity) => this.toPaper(entity))
      .sort((a, b) => this.paperSortValue(b) - this.paperSortValue(a));
  }

  private async fetchHuggingFaceTrending(): Promise<HotPaper[]> {
    const source = SOURCES.find((s) => s.id === 'huggingface-trending')!;
    const json = await this.fetchJson('https://huggingface.co/api/daily_papers') as Array<{
      paper?: {
        id?: string;
        title?: string;
        summary?: string;
        authors?: { name?: string }[];
        publishedAt?: string;
        upvotes?: number;
        githubRepo?: string;
      };
    }>;

    if (!Array.isArray(json)) throw new Error('HuggingFace API 응답 형식이 올바르지 않습니다.');

    return json
      .map((entry): HotPaper | null => {
        const paper = entry.paper;
        if (!paper?.id || !paper.title) return null;
        const url = `https://huggingface.co/papers/${paper.id}`;
        return {
          id: `${source.id}:${paper.id}`,
          sourceId: source.id,
          sourceName: source.name,
          title: this.cleanText(paper.title),
          url,
          summary: this.cleanText(paper.summary ?? ''),
          authors: (paper.authors ?? []).map((author) => this.cleanText(author.name ?? '')).filter(Boolean),
          publishedAt: this.toIsoDate(paper.publishedAt),
          venue: 'Trending',
          upvotes: typeof paper.upvotes === 'number' ? paper.upvotes : undefined,
          pdfUrl: `https://arxiv.org/pdf/${paper.id}`,
          codeUrl: paper.githubRepo,
          tags: ['AI', 'Trending'],
        };
      })
      .filter((paper): paper is HotPaper => paper !== null);
  }

  private async fetchOpenReviewConference(sourceId: string): Promise<HotPaper[]> {
    const source = SOURCES.find((s) => s.id === sourceId)!;
    const config = OPENREVIEW_CONFERENCES[sourceId];
    if (!config) throw new Error(`지원하지 않는 OpenReview source입니다: ${sourceId}`);

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: OPENREVIEW_YEAR_WINDOW }, (_, index) => currentYear - index);
    // Use a Map to deduplicate across strategies (key = noteId)
    const noteMap = new Map<string, unknown>();

    for (const year of years) {
      // Strategy 1: content.venueid — accepted papers only (most precise)
      await this.fetchOpenReviewByVenueid(config, year, noteMap);

      // Strategy 2: invitation-based — broader coverage if venueid missed papers
      if (noteMap.size < MIN_SOURCE_CACHE_COUNT) {
        await this.fetchOpenReviewByInvitation(config, year, noteMap);
      }

      // Enough papers from recent years; no need to go further back
      if (noteMap.size >= OPENREVIEW_MAX_PER_YEAR) break;
    }

    if (noteMap.size === 0) throw new Error(`OpenReview에서 ${config.shortName} 논문을 가져오지 못했습니다.`);

    return this.parseOpenReviewNotes(Array.from(noteMap.values()), source, config);
  }

  private async fetchOpenReviewByVenueid(
    config: { shortName: string; venuePrefix: string },
    year: number,
    noteMap: Map<string, unknown>,
  ): Promise<void> {
    const venueId = encodeURIComponent(`${config.venuePrefix}/${year}/Conference`);
    for (let offset = 0; offset < OPENREVIEW_MAX_PER_YEAR; offset += OPENREVIEW_PAGE_SIZE) {
      const url = `https://api2.openreview.net/notes?content.venueid=${venueId}&sort=cdate:desc&limit=${OPENREVIEW_PAGE_SIZE}&offset=${offset}`;
      try {
        const json = await this.fetchJson(url) as { notes?: unknown[] };
        const notes = Array.isArray(json?.notes) ? json.notes : [];
        for (const note of notes) {
          const id = ((note as Record<string, unknown>).id ?? (note as Record<string, unknown>).forum) as string;
          if (id) noteMap.set(id, note);
        }
        if (notes.length === 0 || notes.length < OPENREVIEW_PAGE_SIZE) break;
      } catch (e) {
        this.logger.warn(`OpenReview ${config.shortName} ${year} venueid fetch failed: ${e instanceof Error ? e.message : e}`);
        break;
      }
    }
  }

  private async fetchOpenReviewByInvitation(
    config: { shortName: string; venuePrefix: string },
    year: number,
    noteMap: Map<string, unknown>,
  ): Promise<void> {
    // Camera-ready = accepted papers; Submission = all submissions (fallback)
    const invitationPatterns = [
      `${config.venuePrefix}/${year}/Conference/-/Camera_Ready_Submission`,
      `${config.venuePrefix}/${year}/Conference/-/Submission`,
    ];

    for (const invitation of invitationPatterns) {
      let added = 0;
      for (let offset = 0; offset < OPENREVIEW_MAX_PER_YEAR; offset += OPENREVIEW_PAGE_SIZE) {
        const url = `https://api2.openreview.net/notes?invitation=${encodeURIComponent(invitation)}&sort=cdate:desc&limit=${OPENREVIEW_PAGE_SIZE}&offset=${offset}`;
        try {
          const json = await this.fetchJson(url) as { notes?: unknown[] };
          const notes = Array.isArray(json?.notes) ? json.notes : [];
          for (const note of notes) {
            const n = note as Record<string, unknown>;
            const c = (n.content ?? {}) as Record<string, { value?: unknown }>;
            // Only keep notes that look like actual paper submissions (have a title)
            const hasTitle = typeof c.title?.value === 'string' && (c.title.value as string).trim().length > 0;
            if (!hasTitle) continue;
            const id = (n.id ?? n.forum) as string;
            if (id && !noteMap.has(id)) {
              noteMap.set(id, note);
              added++;
            }
          }
          if (notes.length === 0 || notes.length < OPENREVIEW_PAGE_SIZE) break;
        } catch (e) {
          this.logger.warn(`OpenReview ${config.shortName} ${year} invitation=${invitation} failed: ${e instanceof Error ? e.message : e}`);
          break;
        }
      }
      // If this invitation pattern gave us papers, no need to try the next pattern
      if (added >= MIN_SOURCE_CACHE_COUNT) break;
    }
  }

  private parseOpenReviewNotes(
    notes: unknown[],
    source: HotPaperSource,
    config: { shortName: string; venuePrefix: string },
  ): HotPaper[] {
    return (notes as Array<Record<string, unknown>>)
      .map((note): HotPaper | null => {
        const c = (note.content ?? {}) as Record<string, { value?: unknown }>;
        const title = typeof c.title?.value === 'string' ? c.title.value.trim() : '';
        if (!title) return null;
        const noteId = (note.forum ?? note.id) as string;
        if (!noteId) return null;
        const paperUrl = `https://openreview.net/forum?id=${noteId}`;
        const pdfPath = typeof c.pdf?.value === 'string' ? c.pdf.value : undefined;
        const pdfUrl = pdfPath ? `https://openreview.net${pdfPath}` : undefined;
        const authors = Array.isArray(c.authors?.value) ? (c.authors.value as string[]).map((a) => String(a).trim()).filter(Boolean) : [];
        const keywords = Array.isArray(c.keywords?.value) ? (c.keywords.value as string[]).slice(0, 6) : [];
        const venue = typeof c.venue?.value === 'string' ? c.venue.value.trim() : config.shortName;
        const abstract = typeof c.abstract?.value === 'string' ? c.abstract.value : '';
        const venueYear = venue.match(/\b20\d{2}\b/)?.[0];
        return {
          id: `${source.id}:${noteId}`,
          sourceId: source.id,
          sourceName: source.name,
          title: this.cleanText(title),
          url: paperUrl,
          summary: this.cleanText(abstract),
          authors,
          publishedAt: typeof note.cdate === 'number' ? new Date(note.cdate).toISOString() : undefined,
          venue,
          pdfUrl,
          tags: Array.from(new Set([config.shortName, venueYear, ...keywords].filter(Boolean) as string[])).slice(0, 8),
        };
      })
      .filter((p): p is HotPaper => p !== null);
  }

  private async fetchDblpConference(sourceId: string): Promise<HotPaper[]> {
    const source = SOURCES.find((s) => s.id === sourceId)!;
    const config = DBLP_CONFERENCES[sourceId];
    if (!config) throw new Error(`지원하지 않는 DBLP source입니다: ${sourceId}`);

    const currentYear = new Date().getFullYear();
    const allowedYears = new Set(Array.from({ length: 3 }, (_, index) => String(currentYear - index)));
    const query = `stream:${config.stream}:`;
    const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=${DBLP_RESULT_LIMIT}`;
    const json = await this.fetchJson(url) as {
      result?: {
        hits?: {
          hit?: DblpHit | DblpHit[];
        };
      };
    };

    const hitsValue = json?.result?.hits?.hit;
    const hits = Array.isArray(hitsValue) ? hitsValue : hitsValue ? [hitsValue] : [];
    const papers = hits
      .map((hit): HotPaper | null => {
        const info = hit.info;
        const title = this.cleanText(info?.title ?? '');
        const url = info?.url || this.firstString(info?.ee) || '';
        if (!title || !url) return null;

        const year = info?.year;
        if (year && !allowedYears.has(String(year))) return null;
        const venue = this.cleanText(info?.venue ?? `${config.shortName}${year ? ` ${year}` : ''}`);
        const authors = this.parseDblpAuthors(info?.authors?.author);
        const ee = this.firstString(info?.ee);
        const doi = info?.doi ? `https://doi.org/${info.doi}` : undefined;

        return {
          id: `${source.id}:${Buffer.from(url).toString('base64url')}`,
          sourceId: source.id,
          sourceName: source.name,
          title,
          url,
          summary: undefined,
          authors,
          publishedAt: year ? new Date(`${year}-01-01T00:00:00.000Z`).toISOString() : undefined,
          venue,
          pdfUrl: ee?.toLowerCase().endsWith('.pdf') ? ee : undefined,
          codeUrl: undefined,
          tags: Array.from(new Set([config.shortName, year, ...config.tags].filter(Boolean) as string[])).slice(0, 8),
          upvotes: undefined,
        };
      })
      .filter((paper): paper is HotPaper => paper !== null)
      .filter((paper) => !paper.title.toLowerCase().startsWith('proceedings of'));

    if (papers.length === 0) throw new Error(`DBLP에서 ${config.shortName} 논문을 가져오지 못했습니다.`);
    return papers;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ResearchAI-HotPapersCrawler/1.0',
          'Accept': 'application/json,*/*',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private filterResult(result: HotPaperListResult, source?: string, limit = 120): HotPaperListResult {
    const papers = source && source !== 'all'
      ? result.papers.filter((paper) => paper.sourceId === source)
      : result.papers;

    return {
      ...result,
      papers: papers.slice(0, Math.min(Math.max(limit, 1), 800)),
    };
  }

  private dedupe(papers: HotPaper[]): HotPaper[] {
    const seen = new Set<string>();
    return papers.filter((paper) => {
      // Use paper.id as the dedup key: stripping query params breaks OpenReview URLs
      // (all forum?id=XXX pages would collapse to the same base URL)
      const key = paper.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private cleanText(value: string): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private toIsoDate(value?: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private firstString(value?: string | string[]): string | undefined {
    if (Array.isArray(value)) return value.find((item) => typeof item === 'string' && item.trim().length > 0);
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private parseDblpAuthors(value?: DblpAuthor | DblpAuthor[]): string[] {
    const authors = Array.isArray(value) ? value : value ? [value] : [];
    return authors
      .map((author) => typeof author === 'string' ? author : author.text ?? '')
      .map((author) => this.cleanText(author))
      .filter(Boolean);
  }

  private toPaperEntity(paper: HotPaper): HotPaperEntity {
    return this.paperRepo.create({
      id: paper.id,
      sourceId: paper.sourceId,
      sourceName: paper.sourceName,
      title: this.cleanText(paper.title),
      url: paper.url,
      summary: paper.summary ? this.cleanText(paper.summary) : null,
      aiSummary: paper.aiSummary ? this.cleanText(paper.aiSummary) : null,
      aiSummaryModel: paper.aiSummaryModel ?? null,
      aiSummaryAt: paper.aiSummaryAt ?? null,
      authorsJson: JSON.stringify(paper.authors ?? []),
      publishedAt: paper.publishedAt ?? null,
      venue: paper.venue ?? null,
      upvotes: typeof paper.upvotes === 'number' ? paper.upvotes : null,
      pdfUrl: paper.pdfUrl ?? null,
      codeUrl: paper.codeUrl ?? null,
      tagsJson: JSON.stringify(paper.tags ?? []),
    });
  }

  private toPaper(entity: HotPaperEntity): HotPaper {
    return {
      id: entity.id,
      sourceId: entity.sourceId,
      sourceName: entity.sourceName,
      title: entity.title,
      url: entity.url,
      summary: entity.summary ?? undefined,
      aiSummary: entity.aiSummary ?? undefined,
      aiSummaryModel: entity.aiSummaryModel ?? undefined,
      aiSummaryAt: entity.aiSummaryAt ?? undefined,
      authors: this.parseJsonArray(entity.authorsJson),
      publishedAt: entity.publishedAt ?? undefined,
      venue: entity.venue ?? undefined,
      upvotes: entity.upvotes ?? undefined,
      pdfUrl: entity.pdfUrl ?? undefined,
      codeUrl: entity.codeUrl ?? undefined,
      tags: this.parseJsonArray(entity.tagsJson),
    };
  }

  private buildAiSummaryPrompt(paper: HotPaper): string {
    const authors = paper.authors.length ? paper.authors.slice(0, 12).join(', ') : '저자 정보 없음';
    const tags = paper.tags.length ? paper.tags.join(', ') : '태그 없음';
    const summary = paper.summary?.trim() || '수집된 초록/요약이 없습니다. 제목과 메타데이터만 근거로 제한적으로 요약하세요.';

    return `아래 논문을 한국어로 요약해줘.

## 논문 정보
- 제목: ${paper.title}
- 출처: ${paper.sourceName}
- 게재/분류: ${paper.venue ?? '정보 없음'}
- 날짜: ${paper.publishedAt ?? '정보 없음'}
- 저자: ${authors}
- 태그: ${tags}
- 원문: ${paper.url}
- PDF/arXiv: ${paper.pdfUrl ?? '정보 없음'}
- Code: ${paper.codeUrl ?? '정보 없음'}

## 수집된 초록/요약
${summary}

## 출력 형식

### 한 줄 요약
- 논문의 핵심 기여를 한 문장으로 요약

### 무엇을 해결하나
- 문제 배경과 기존 접근의 한계

### 핵심 아이디어
- 방법론/모델/데이터/실험 설계의 핵심 3~5개

### 왜 핫한가
- 연구적 의미, 실무 적용 가능성, 생태계 영향

### 읽을 때 볼 포인트
- 논문을 읽을 때 확인할 질문 3개

주의:
- 제공된 정보에 없는 수치나 성능을 만들지 마세요.
- 초록이 부족하면 제목과 메타데이터 기반의 제한적 해석이라고 명시하세요.`;
  }

  private async getLastRefreshAt(): Promise<string | null> {
    const state = await this.refreshStateRepo.findOne({ where: { key: REFRESH_STATE_KEY } });
    return state?.refreshedAt || null;
  }

  private async setLastRefreshAt(value: string): Promise<void> {
    await this.refreshStateRepo.save(this.refreshStateRepo.create({ key: REFRESH_STATE_KEY, refreshedAt: value }));
  }

  private sourceRefreshStateKey(sourceId: string): string {
    return `${REFRESH_STATE_KEY}:${sourceId}`;
  }

  private async getLastSourceRefreshAt(sourceId: string): Promise<string | null> {
    const state = await this.refreshStateRepo.findOne({ where: { key: this.sourceRefreshStateKey(sourceId) } });
    return state?.refreshedAt || null;
  }

  private async setLastSourceRefreshAt(sourceId: string, value: string): Promise<void> {
    await this.refreshStateRepo.save(this.refreshStateRepo.create({
      key: this.sourceRefreshStateKey(sourceId),
      refreshedAt: value,
    }));
  }

  private paperSortValue(paper: HotPaper): number {
    const dateValue = paper.publishedAt ? new Date(paper.publishedAt).getTime() : 0;
    const safeDateValue = Number.isNaN(dateValue) ? 0 : dateValue;
    return safeDateValue + (paper.upvotes ?? 0);
  }

  private parseJsonArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private extractTrendKeywords(papers: HotPaper[]): HotPaperTrendKeyword[] {
    const counts = new Map<string, number>();
    for (const paper of papers) {
      const text = [paper.title, paper.summary ?? '', ...paper.tags].join(' ');
      for (const keyword of this.tokenizeTrendKeywords(text)) {
        counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));
  }

  private tokenizeTrendKeywords(text: string): string[] {
    return (text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\p{L}\p{N}+#.-]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^[#.-]+|[#.-]+$/g, '').trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !/^\d+$/.test(token))
      .filter((token) => !TREND_STOPWORDS.has(token.toLowerCase()))
      .map((token) => token.length > 30 ? token.slice(0, 30) : token);
  }

  private buildTrendPrompt(papers: HotPaper[], keywords: HotPaperTrendKeyword[]): string {
    const paperLines = papers.slice(0, 120).map((paper, index) => {
      const authors = paper.authors.length ? ` / 저자: ${paper.authors.slice(0, 4).join(', ')}` : '';
      const summary = paper.summary ? ` - ${paper.summary.slice(0, 120)}` : '';
      const venue = paper.venue ? ` [${paper.venue}]` : '';
      const upvotes = typeof paper.upvotes === 'number' ? ` ▲${paper.upvotes}` : '';
      return `${index + 1}. ${paper.sourceName}${venue}${upvotes}: ${paper.title}${summary}${authors}`;
    }).join('\n');
    const keywordLines = keywords.map((item) => `${item.keyword}(${item.count})`).join(', ');

    return `다음은 현재 핫한 AI/ML 논문 목록이야.

[자주 등장한 키워드]
${keywordLines || '없음'}

[논문 목록]
${paperLines}

아래 형식으로 한국어 Markdown만 출력해줘.

## 핵심 요약
- 2~3문장으로 현재 가장 뜨거운 연구 흐름을 요약

## 핫 리서치 토픽
- 토픽명: 왜 주목받는지, 어떤 논문에서 근거가 보이는지
- 4~6개

## 반복 키워드 해석
- 키워드: 이 키워드가 어떤 연구 흐름/기술을 의미하는지
- 5~8개

## 주목할 논문
- 논문 제목 (출처): 왜 봐야 하는지
- 3~5개`;
  }

  private trendCacheKey(options: { model: string; papers: HotPaper[] }): string {
    const hash = createHash('sha256')
      .update(options.papers.map((p) => `${p.id}:${p.publishedAt ?? ''}`).join('|'))
      .digest('hex')
      .slice(0, 16);
    return `${options.model}:${hash}`;
  }

  private async readStoredTrendSummary(
    cacheKey: string,
    now = Date.now(),
  ): Promise<{ value: HotPaperTrendSummary; expiresAtMs: number } | null> {
    const entity = await this.trendRepo.findOne({ where: { cacheKey } });
    if (!entity) return null;
    const expiresAtMs = new Date(entity.expiresAt).getTime();
    if (expiresAtMs <= now) return null;

    return {
      expiresAtMs,
      value: {
        summary: entity.summary,
        keywords: this.parseTrendKeywords(entity.keywordsJson),
        paperCount: entity.paperCount,
        sourceCount: entity.sourceCount,
        generatedAt: entity.generatedAt,
        cached: true,
        model: entity.model,
      },
    };
  }

  private async storeTrendSummary(cacheKey: string, value: HotPaperTrendSummary): Promise<void> {
    const expiresAt = new Date(Date.now() + TREND_CACHE_MS).toISOString();
    await this.trendRepo.save(this.trendRepo.create({
      cacheKey,
      summary: value.summary,
      keywordsJson: JSON.stringify(value.keywords ?? []),
      paperCount: value.paperCount,
      sourceCount: value.sourceCount,
      generatedAt: value.generatedAt,
      expiresAt,
      model: value.model,
    }));
  }

  private parseTrendKeywords(value: string): HotPaperTrendKeyword[] {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is HotPaperTrendKeyword => (
        item && typeof item === 'object' &&
        typeof item.keyword === 'string' &&
        typeof item.count === 'number'
      ));
    } catch {
      return [];
    }
  }
}
