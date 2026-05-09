import { Injectable, Logger } from '@nestjs/common';
import { load } from 'cheerio';

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

const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class HotPapersService {
  private readonly logger = new Logger(HotPapersService.name);
  private cache: HotPaperListResult | null = null;
  private cacheExpiresAt = 0;

  async getPapers(options: { source?: string; limit?: number; refresh?: boolean } = {}): Promise<HotPaperListResult> {
    const now = Date.now();
    if (!options.refresh && this.cache && this.cacheExpiresAt > now) {
      return this.filterResult(this.cache, options.source, options.limit);
    }

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

    const result: HotPaperListResult = {
      sources: SOURCES,
      papers: this.dedupe(papers),
      errors,
      fetchedAt: new Date().toISOString(),
    };

    this.cache = result;
    this.cacheExpiresAt = now + CACHE_TTL_MS;
    return this.filterResult(result, options.source, options.limit);
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
}
