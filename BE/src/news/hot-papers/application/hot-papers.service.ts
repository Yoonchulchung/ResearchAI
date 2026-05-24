import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { load } from 'cheerio';
import { In, Repository } from 'typeorm';
import { HotPaperEntity } from '../domain/entity/hot-paper.entity';
import { ContentRefreshStateEntity } from '../../../shared/entity/content-refresh-state.entity';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';

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

const SOURCES: HotPaperSource[] = [
  { id: 'huggingface-trending', name: 'Hugging Face Trending Papers', url: 'https://huggingface.co/papers/trending' },
  { id: 'neurips', name: 'NeurIPS Proceedings', url: 'https://papers.nips.cc/' },
];

const REQUEST_TIMEOUT_MS = 15_000;
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 60 * 60 * 1000;
const REFRESH_STATE_KEY = 'content-refresh:hot-papers';
const DEFAULT_AI_SUMMARY_MODEL = 'claude-haiku-4-5-20251001';

@Injectable()
export class HotPapersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HotPapersService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<HotPaperListResult['errors']> | null = null;

  constructor(
    @InjectRepository(HotPaperEntity)
    private readonly paperRepo: Repository<HotPaperEntity>,
    @InjectRepository(ContentRefreshStateEntity)
    private readonly refreshStateRepo: Repository<ContentRefreshStateEntity>,
    private readonly aiProvider: AiProviderService,
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

    if (options.refresh || cachedCount === 0) {
      errors = await this.refreshCache();
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

  private async refreshCacheIfStale(): Promise<void> {
    const lastRefreshAt = await this.getLastRefreshAt();
    const empty = (await this.paperRepo.count()) === 0;
    if (!empty && lastRefreshAt && Date.now() - new Date(lastRefreshAt).getTime() < DAILY_REFRESH_MS) return;
    await this.refreshCache();
  }

  private async refreshCache(): Promise<HotPaperListResult['errors']> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.collectAndStorePapers()
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async collectAndStorePapers(): Promise<HotPaperListResult['errors']> {
    const settled = await Promise.allSettled([
      this.fetchHuggingFaceTrending(),
      this.fetchNeuripsLatest(),
    ]);
    const papers: HotPaper[] = [];
    const errors: HotPaperListResult['errors'] = [];

    settled.forEach((result, index) => {
      const source = SOURCES[index];
      if (result.status === 'fulfilled') {
        papers.push(...result.value);
        return;
      }
      const message = result.reason instanceof Error ? result.reason.message : '논문 수집에 실패했습니다.';
      errors.push({ sourceId: source.id, message });
      this.logger.warn(`${source.name} crawl failed: ${message}`);
    });

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
    await this.setLastRefreshAt(new Date().toISOString());
    return errors;
  }

  private async readCachedPapers(): Promise<HotPaper[]> {
    const entities = await this.paperRepo.find({ order: { publishedAt: 'DESC', updatedAt: 'DESC' } });
    return entities
      .map((entity) => this.toPaper(entity))
      .sort((a, b) => this.paperSortValue(b) - this.paperSortValue(a));
  }

  private async fetchHuggingFaceTrending(): Promise<HotPaper[]> {
    const source = SOURCES[0];
    const html = await this.fetchText(source.url);
    const $ = load(html);
    const rawProps = $('[data-target="DailyPapers"]').first().attr('data-props');
    if (!rawProps) throw new Error('DailyPapers 데이터를 찾을 수 없습니다.');

    const props = JSON.parse(rawProps) as {
      dailyPapers?: Array<{
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
    };

    return (props.dailyPapers ?? [])
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
          pdfUrl: `https://arxiv.org/abs/${paper.id}`,
          codeUrl: paper.githubRepo,
          tags: ['AI', 'Trending'],
        };
      })
      .filter((paper): paper is HotPaper => paper !== null);
  }

  private async fetchNeuripsLatest(): Promise<HotPaper[]> {
    const source = SOURCES[1];
    const rootHtml = await this.fetchText(source.url);
    const root = load(rootHtml);
    const latestHref = root('.proceedings-list a[href*="/paper_files/paper/"]').first().attr('href') ?? '/paper_files/paper/2025';
    const latestUrl = this.absoluteUrl(latestHref, source.url);
    const html = await this.fetchText(latestUrl);
    const $ = load(html);
    const venue = this.cleanText($('.book-meta').first().text()) || 'NeurIPS';
    const papers: HotPaper[] = [];

    $('.paper-list li').each((_, el) => {
      if (papers.length >= 80) return false;
      const item = $(el);
      const anchor = item.find('a[title="paper title"]').first();
      const title = this.cleanText(anchor.text());
      const href = anchor.attr('href') ?? '';
      if (!title || !href) return;

      const url = this.absoluteUrl(href, source.url);
      const authors = this.cleanText(item.find('.paper-authors').first().text())
        .split(',')
        .map((author) => this.cleanText(author))
        .filter((author) => author && author !== 'Error');
      const track = this.cleanText(item.find('.paper-track-badge').first().text());

      papers.push({
        id: `${source.id}:${Buffer.from(url).toString('base64url')}`,
        sourceId: source.id,
        sourceName: source.name,
        title,
        url,
        authors,
        venue,
        tags: track ? [track] : ['Proceedings'],
      });
    });

    return papers;
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ResearchAI-HotPapersCrawler/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
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
      papers: papers.slice(0, Math.min(Math.max(limit, 1), 300)),
    };
  }

  private dedupe(papers: HotPaper[]): HotPaper[] {
    const seen = new Set<string>();
    return papers.filter((paper) => {
      const key = paper.url.replace(/[#?].*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private absoluteUrl(url: string, base: string): string {
    try {
      return new URL(url, base).toString();
    } catch {
      return '';
    }
  }

  private cleanText(value: string): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private toIsoDate(value?: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
}
