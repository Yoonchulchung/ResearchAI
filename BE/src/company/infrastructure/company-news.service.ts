import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PuppeteerService } from 'src/browse/infrastructure/puppeteer.service';
import { CompanyNewsKeywordEntity } from 'src/company/domain/entity/company-news-keyword.entity';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { requestContext } from 'src/shared/request-context';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import {
  deduplicateNewsItems,
  filterNewNewsItems,
} from 'src/news/application/news-dedup.utils';

export interface CompanyNewsItem {
  id?: string;
  title: string;
  url: string;
  snippet: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  fetchedAt?: string;
  source?: string;
}

interface NaverNewsResponse {
  items?: {
    title?: string;
    originallink?: string;
    link?: string;
    description?: string;
    pubDate?: string;
  }[];
}

export interface CompanyNewsKeyword {
  keyword: string;
  category?: string;
  reason?: string;
}

export interface CompanyNewsKeywordResult {
  keywords: CompanyNewsKeyword[];
  model: string;
  sourceTitleCount: number;
  runId?: string;
  createdAt?: string;
}

// 주가·투자 정보 필터 키워드 (제목 또는 snippet에 포함 시 제외)
const INVESTMENT_KEYWORDS = [
  // 주가·시세
  '주가',
  '주식',
  '시가총액',
  '코스피',
  '코스닥',
  '나스닥',
  '다우',
  '종가',
  '시초가',
  '호가',
  '52주',
  '신고가',
  '신저가',
  // 사용자가 뉴스 탭에서 제외하기 원하는 재무·전망 맥락
  '매출',
  '전망',
  // 투자 의견
  '목표주가',
  '목표가',
  '투자의견',
  '매수',
  '매도',
  '중립',
  '비중확대',
  '비중축소',
  '강력매수',
  '보유',
  '언더퍼폼',
  '아웃퍼폼',
  '오버웨이트',
  '언더웨이트',
  // 증권사 리포트
  '증권사',
  '리포트',
  '애널리스트',
  '분석가',
  '리서치',
  '컨센서스',
  // 지수·펀드
  '상장지수펀드',
  'ETF',
  '펀드',
  '운용사',
  '자산운용',
  // 재무비율 (단독 언급 시 투자 맥락)
  'PER',
  'PBR',
  'ROE',
  'EPS',
  'BPS',
  // 배당
  '배당수익률',
  '배당금',
  '배당락',
  // 공매도·선물
  '공매도',
  '선물',
  '옵션',
  '콜옵션',
  '풋옵션',
  // 기타
  '주주',
  '지분율',
  '최대주주',
  '외국인 순매수',
  '기관 순매수',
  '개인 순매수',
  'stock price',
  'share price',
  'target price',
  'buy rating',
  'sell rating',
];

function isInvestmentNews(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  return INVESTMENT_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

@Injectable()
export class CompanyNewsService {
  private readonly logger = new Logger(CompanyNewsService.name);
  private readonly imageFetchConcurrency = 3;

  constructor(
    private readonly puppeteer: PuppeteerService,
    private readonly aiProvider: AiProviderService,
    @InjectRepository(CompanyNewsEntity)
    private readonly newsRepo: Repository<CompanyNewsEntity>,
    @InjectRepository(CompanyNewsKeywordEntity)
    private readonly keywordRepo: Repository<CompanyNewsKeywordEntity>,
  ) {}

  /** 실시간 수집 + DB 저장 */
  async fetchAndSaveNews(
    companyId: string,
    companyName: string,
    limit = 12,
    offset = 0,
  ): Promise<CompanyNewsItem[]> {
    this.logger.log(
      `기업 뉴스 하이브리드 검색: ${companyName} offset=${offset}`,
    );

    let items: CompanyNewsItem[] = [];
    try {
      items = await this.collectHybridNews(companyName, limit, offset);
      items = await this.enrichNewsImages(items);
    } catch (e) {
      this.logger.warn(
        `뉴스 검색 실패 (${companyName}): ${(e as Error).message}`,
      );
      return [];
    }

    items = await this.filterUnseenItems(companyId, items);
    const saved = await this.saveItems(companyId, items);
    if (saved > 0) this.logger.log(`${companyName} 뉴스 ${saved}건 저장 완료`);

    return items;
  }

  /** 저장된 최신 기사 시점부터 현재 요청 시점까지 새 기사만 증분 수집 */
  async fetchLatestNewsSinceLastCollection(
    companyId: string,
    companyName: string,
  ): Promise<CompanyNewsItem[]> {
    const latest = await this.newsRepo.findOne({
      where: { companyId },
      order: { publishedAt: 'DESC', fetchedAt: 'DESC' },
      select: ['publishedAt'],
    });
    const latestPublishedAt = latest?.publishedAt
      ? new Date(latest.publishedAt)
      : null;
    const hasValidLatestDate =
      latestPublishedAt != null && Number.isFinite(latestPublishedAt.getTime());
    const raw: CompanyNewsItem[] = [];
    const pageSize = 100;

    if (this.getNaverCredentials()) {
      for (let start = 1; start < 1000; start += pageSize) {
        const items = await this.callNaverApi(
          `"${companyName}" 뉴스`,
          pageSize,
          start,
        );
        raw.push(...items);
        if (items.length < pageSize || !hasValidLatestDate) break;

        const oldestPublishedAt = items.reduce<Date | null>((oldest, item) => {
          if (!item.publishedAt) return oldest;
          const publishedAt = new Date(item.publishedAt);
          if (!Number.isFinite(publishedAt.getTime())) return oldest;
          return !oldest || publishedAt < oldest ? publishedAt : oldest;
        }, null);
        if (oldestPublishedAt && oldestPublishedAt <= latestPublishedAt) {
          break;
        }
      }
    } else {
      raw.push(...(await this.collectHybridNews(companyName, 50, 0)));
    }

    const inRequestedRange = raw.filter((item) => {
      if (!hasValidLatestDate) return true;
      if (!item.publishedAt) return false;
      const publishedAt = new Date(item.publishedAt);
      return (
        Number.isFinite(publishedAt.getTime()) &&
        publishedAt > latestPublishedAt
      );
    });
    const deduped = deduplicateNewsItems(
      this.dedupeNewsItems(inRequestedRange),
    ).filter((item) => !isInvestmentNews(item.title, item.snippet ?? ''));
    const newItems = await this.filterUnseenItems(companyId, deduped);
    const enriched = await this.enrichNewsImages(newItems);
    const saved = await this.saveItems(companyId, enriched);
    this.logger.log(
      `최신 뉴스 증분 수집: ${companyName} since=${latest?.publishedAt ?? 'none'} fetched=${raw.length} inRange=${inRequestedRange.length} saved=${saved}`,
    );
    return enriched;
  }

  /** DB에 저장된 뉴스 조회 */
  async getSavedNews(
    companyId: string,
    limit = 50,
    offset = 0,
  ): Promise<CompanyNewsItem[]> {
    const rows = await this.newsRepo.find({
      where: { companyId },
      order: { publishedAt: 'DESC', fetchedAt: 'DESC' },
    });
    return deduplicateNewsItems(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        snippet: r.snippet ?? '',
        imageUrl: r.imageUrl,
        publishedAt: r.publishedAt,
        fetchedAt: r.fetchedAt.toISOString(),
      })),
    ).slice(offset, offset + limit);
  }

  /** 하위 호환: 실시간 수집만 (저장 없음) */
  async fetchNews(companyName: string, limit = 10): Promise<CompanyNewsItem[]> {
    try {
      const items = await this.collectHybridNews(companyName, limit, 0);
      return this.enrichNewsImages(items);
    } catch (e) {
      this.logger.warn(
        `뉴스 검색 실패 (${companyName}): ${(e as Error).message}`,
      );
      return [];
    }
  }

  async detectTitleKeywords(
    companyId: string,
    companyName: string,
    titles: string[],
    model: string,
  ): Promise<CompanyNewsKeywordResult> {
    const cleanTitles = this.normalizeTitles(titles).slice(0, 80);
    if (!cleanTitles.length) {
      await this.keywordRepo.delete({ companyId });
      return { keywords: [], model, sourceTitleCount: 0 };
    }

    const system = [
      '너는 기업 뉴스 제목만 보고 핵심 키워드를 추출하는 분석가다.',
      '기사 본문, 요약, URL은 사용하지 말고 사용자가 제공한 제목 텍스트만 근거로 삼아라.',
      '출력은 반드시 JSON만 반환해라.',
    ].join('\n');
    const prompt = [
      `기업명: ${companyName}`,
      '아래 뉴스 제목들만 보고 기업 이슈를 대표하는 키워드를 최대 12개 추출해라.',
      '너무 일반적인 단어(뉴스, 기업, 관련, 발표, 진행 등)는 제외해라.',
      '투자/주가/목표가 중심 키워드는 제품, 사업, 채용, 기술, 사건 키워드보다 우선하지 마라.',
      '반환 JSON 형식:',
      '{"keywords":[{"keyword":"키워드","category":"제품|사업|기술|채용|파트너십|리스크|기타","reason":"짧은 근거"}]}',
      '',
      cleanTitles.map((title, index) => `${index + 1}. ${title}`).join('\n'),
    ].join('\n');

    const result = await this.aiProvider.call(model, system, prompt, {
      caller: 'CompanyNews/detectTitleKeywords',
    });
    const effectiveModel = this.aiProvider.resolveEffectiveModel(model);
    const keywords = this.parseKeywordResponse(result.text);
    const runId = randomUUID();

    await this.keywordRepo.delete({ companyId });
    const savedRows = keywords.length
      ? await this.keywordRepo.save(
          keywords.map((item, index) =>
            this.keywordRepo.create({
              id: randomUUID(),
              companyId,
              runId,
              keyword: item.keyword,
              category: item.category ?? null,
              reason: item.reason ?? null,
              model: effectiveModel,
              sourceTitleCount: cleanTitles.length,
              rank: index,
            }),
          ),
        )
      : [];

    return {
      keywords,
      model: effectiveModel,
      sourceTitleCount: cleanTitles.length,
      runId,
      createdAt: savedRows[0]?.createdAt?.toISOString(),
    };
  }

  async getSavedTitleKeywords(
    companyId: string,
  ): Promise<CompanyNewsKeywordResult> {
    const rows = await this.keywordRepo.find({
      where: { companyId },
      order: { rank: 'ASC', createdAt: 'DESC' },
    });
    const first = rows[0];

    return {
      keywords: rows.map((row) => ({
        keyword: row.keyword,
        category: row.category ?? undefined,
        reason: row.reason ?? undefined,
      })),
      model: first?.model ?? '',
      sourceTitleCount: first?.sourceTitleCount ?? 0,
      runId: first?.runId,
      createdAt: first?.createdAt?.toISOString(),
    };
  }

  private async collectHybridNews(
    companyName: string,
    limit: number,
    offset: number,
  ): Promise<CompanyNewsItem[]> {
    const searchLimit = this.clampInteger(limit, 12, 1, 100);
    const searchOffset = this.clampInteger(offset, 0, 0, 1000);
    const [naverResult, duckDuckGoResult] = await Promise.allSettled([
      this.searchNaverNews(companyName, searchLimit, searchOffset),
      this.searchDuckDuckGoNews(companyName, searchLimit, searchOffset),
    ]);

    const naverItems =
      naverResult.status === 'fulfilled' ? naverResult.value : [];
    const duckDuckGoItems =
      duckDuckGoResult.status === 'fulfilled' ? duckDuckGoResult.value : [];

    if (naverResult.status === 'rejected') {
      this.logger.warn(
        `Naver 뉴스 검색 실패 (${companyName}): ${this.errorMessage(naverResult.reason)}`,
      );
    }
    if (duckDuckGoResult.status === 'rejected') {
      this.logger.warn(
        `DuckDuckGo 뉴스 검색 실패 (${companyName}): ${this.errorMessage(duckDuckGoResult.reason)}`,
      );
    }

    return deduplicateNewsItems(
      this.dedupeNewsItems([...naverItems, ...duckDuckGoItems]),
    ).filter((item) => !isInvestmentNews(item.title, item.snippet ?? ''));
  }

  /** Naver API 저수준 호출 — query 문자열을 직접 받음 */
  private async callNaverApi(
    query: string,
    display: number,
    start: number,
  ): Promise<CompanyNewsItem[]> {
    const credentials = this.getNaverCredentials();
    if (!credentials || start >= 1000) return [];

    const params = new URLSearchParams({
      query,
      display: String(Math.min(display, 100)),
      start: String(start),
      sort: 'date',
    });

    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?${params.toString()}`,
      {
        headers: {
          'X-Naver-Client-Id': credentials.clientId,
          'X-Naver-Client-Secret': credentials.clientSecret,
        },
      },
    );
    if (!res.ok) throw new Error(`Naver HTTP ${res.status}`);

    const data = (await res.json()) as NaverNewsResponse;
    return (data.items ?? [])
      .map((item) => ({
        title: this.stripHtml(item.title ?? ''),
        url: item.originallink || item.link || '',
        snippet: this.stripHtml(item.description ?? ''),
        publishedAt: this.parseNaverPubDate(item.pubDate),
        source: 'Naver News',
      }))
      .filter((item) => item.title && item.url);
  }

  private async searchNaverNews(
    companyName: string,
    limit: number,
    offset: number,
  ): Promise<CompanyNewsItem[]> {
    if (!this.getNaverCredentials()) {
      this.logger.debug('Naver 뉴스 API 키가 없어 DuckDuckGo만 사용합니다.');
      return [];
    }
    const items = await this.callNaverApi(
      `"${companyName}" 뉴스`,
      limit,
      offset + 1,
    );
    this.logger.log(
      `Naver 뉴스 검색: company="${companyName}" start=${offset + 1} results=${items.length}`,
    );
    return items;
  }

  /**
   * 대량 뉴스 수집 — 다중 쿼리 × 페이지 오프셋(round)로 과거 데이터 순차 수집
   * round=0: 최신 300건, round=1: 그 이전 300건, round=2: 더 이전 300건 (Naver 최대 1000)
   * hasMore=true이면 round+1 로 추가 수집 가능
   */
  async bulkFetchAndSaveNews(
    companyId: string,
    companyName: string,
    round = 0,
  ): Promise<{ fetched: number; saved: number; hasMore: boolean }> {
    const PAGES_PER_ROUND = 3; // 한 라운드당 3페이지 × 100 = 300건/쿼리
    const startBase = round * PAGES_PER_ROUND * 100; // 0, 300, 600, ...

    if (!this.getNaverCredentials()) {
      this.logger.warn('Naver API 키 없음 — DuckDuckGo로 단순 수집만 실행');
      const items = await this.collectHybridNews(companyName, 50, startBase);
      await this.saveItems(companyId, items);
      return { fetched: items.length, saved: items.length, hasMore: false };
    }

    const QUERIES = [
      `"${companyName}"`,
      `"${companyName}" 사업 출시 수주`,
      `"${companyName}" 계획 투자 파트너십`,
    ];
    const raw: CompanyNewsItem[] = [];

    for (const query of QUERIES) {
      for (let p = 0; p < PAGES_PER_ROUND; p++) {
        const start = startBase + p * 100 + 1;
        if (start >= 1000) break; // Naver API 최대 한도
        try {
          const items = await this.callNaverApi(query, 100, start);
          raw.push(...items);
          this.logger.log(
            `대량수집(round=${round}): query="${query}" start=${start} got=${items.length}`,
          );
          if (items.length < 100) break; // 결과 소진
          await new Promise((r) => setTimeout(r, 150));
        } catch (e) {
          this.logger.warn(
            `대량수집 실패 (${query} start=${startBase + p * 100 + 1}): ${(e as Error).message}`,
          );
          break;
        }
      }
    }

    const deduped = deduplicateNewsItems(this.dedupeNewsItems(raw)).filter(
      (item) => !isInvestmentNews(item.title, item.snippet ?? ''),
    );

    const newItems = await this.filterUnseenItems(companyId, deduped);
    const saved = await this.saveItems(companyId, newItems);
    const hasMore = startBase + PAGES_PER_ROUND * 100 < 1000;
    this.logger.log(
      `대량수집 완료(round=${round}): raw=${raw.length} dedup=${deduped.length} saved=${saved} hasMore=${hasMore}`,
    );
    return { fetched: deduped.length, saved, hasMore };
  }

  /** DB 저장 공통 로직 — 새로 삽입된 건수 반환 */
  private async saveItems(
    companyId: string,
    items: CompanyNewsItem[],
  ): Promise<number> {
    if (!items.length) return 0;
    let saved = 0;
    await Promise.allSettled(
      items.map(async (item) => {
        try {
          const result = await this.newsRepo
            .createQueryBuilder()
            .insert()
            .into(CompanyNewsEntity)
            .values({
              id: randomUUID(),
              companyId,
              title: item.title,
              url: item.url,
              snippet: item.snippet || null,
              imageUrl: item.imageUrl || null,
              publishedAt: item.publishedAt ?? null,
              source: item.source ?? null,
            })
            .orIgnore()
            .execute();
          const raw = result.raw as { changes?: number } | undefined;
          if ((raw?.changes ?? result.identifiers?.length ?? 0) > 0) saved++;
        } catch {
          /* URL unique violation 무시 */
        }
      }),
    );
    return saved;
  }

  private async filterUnseenItems(
    companyId: string,
    items: CompanyNewsItem[],
  ): Promise<CompanyNewsItem[]> {
    if (!items.length) return [];
    const existing = await this.newsRepo.find({
      where: { companyId },
      select: [
        'title',
        'url',
        'publishedAt',
        'fetchedAt',
        'snippet',
        'imageUrl',
      ],
    });
    return filterNewNewsItems(existing, deduplicateNewsItems(items));
  }

  private async searchDuckDuckGoNews(
    companyName: string,
    limit: number,
    offset: number,
  ): Promise<CompanyNewsItem[]> {
    const query = `"${companyName}" 뉴스 최신`;
    const results = await this.puppeteer.searchGoogle(query, limit, offset);
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: 'DuckDuckGo',
    }));
  }

  private getNaverCredentials(): {
    clientId: string;
    clientSecret: string;
  } | null {
    const keys = requestContext.getStore()?.apiKeys;
    const clientId = keys?.naverClientId?.trim() || process.env.NAVER_CLIENT_ID;
    const clientSecret =
      keys?.naverClientSecret?.trim() || process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }

  private dedupeNewsItems(items: CompanyNewsItem[]): CompanyNewsItem[] {
    const seen = new Set<string>();
    const deduped: CompanyNewsItem[] = [];

    for (const item of items) {
      const key = this.normalizeNewsUrl(item.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    return deduped;
  }

  private normalizeNewsUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      parsed.searchParams.delete('utm_term');
      parsed.searchParams.delete('utm_content');
      return parsed.toString();
    } catch {
      return url.trim();
    }
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeTitles(titles: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const title of titles) {
      const clean = this.stripHtml(String(title ?? ''))
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean || clean.length < 2 || seen.has(clean)) continue;
      seen.add(clean);
      normalized.push(clean);
    }

    return normalized;
  }

  private parseKeywordResponse(text: string): CompanyNewsKeyword[] {
    const jsonText = this.extractJsonObject(text);
    if (!jsonText) return [];

    try {
      const parsed = JSON.parse(jsonText) as {
        keywords?: Array<{
          keyword?: unknown;
          category?: unknown;
          reason?: unknown;
        }>;
      };
      const seen = new Set<string>();
      return (parsed.keywords ?? [])
        .map((item) => ({
          keyword:
            typeof item.keyword === 'string' || typeof item.keyword === 'number'
              ? String(item.keyword).trim()
              : '',
          category:
            typeof item.category === 'string'
              ? item.category.trim()
              : undefined,
          reason:
            typeof item.reason === 'string' ? item.reason.trim() : undefined,
        }))
        .filter((item) => {
          if (!item.keyword || seen.has(item.keyword)) return false;
          seen.add(item.keyword);
          return true;
        })
        .slice(0, 12);
    } catch (e) {
      this.logger.warn(`뉴스 키워드 JSON 파싱 실패: ${(e as Error).message}`);
      return [];
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : '알 수 없는 오류';
  }

  private extractJsonObject(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();

    const match = trimmed.match(/\{[\s\S]*\}/);
    return match?.[0] ?? null;
  }

  private parseNaverPubDate(value?: string): string | null {
    if (!value) return null;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return null;
    return new Date(timestamp).toISOString();
  }

  private clampInteger(
    value: number,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.floor(value), min), max);
  }

  private async enrichNewsImages(
    items: CompanyNewsItem[],
  ): Promise<CompanyNewsItem[]> {
    const enriched: CompanyNewsItem[] = [];

    for (let i = 0; i < items.length; i += this.imageFetchConcurrency) {
      const chunk = items.slice(i, i + this.imageFetchConcurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          try {
            const metadata = await this.puppeteer.fetchOpenGraphImage(item.url);
            return {
              ...item,
              imageUrl: metadata.image ?? null,
            };
          } catch (e) {
            this.logger.debug(
              `뉴스 이미지 수집 실패 (${item.url}): ${(e as Error).message}`,
            );
            return { ...item, imageUrl: null };
          }
        }),
      );
      enriched.push(...chunkResults);
    }

    return enriched;
  }
}
