import { Injectable, Logger, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { PuppeteerService } from '../../browse/infrastructure/puppeteer.service';
import { SessionGateway } from '../../sessions/presentation/session.gateway';

export interface NamuWikiCompanyInfo {
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
}

const CATEGORY_MAP: { pattern: RegExp; type: string }[] = [
  { pattern: /대기업/,                                                    type: '대기업' },
  { pattern: /중견기업/,                                                   type: '중견기업' },
  { pattern: /중소기업|스타트업|벤처/,                                     type: '중소기업' },
  { pattern: /공기업|준정부기관|기타공공기관|지방공기업|공공기관|공공/,    type: '공공기관' },
  { pattern: /금융기관|은행|증권|보험사|카드사|캐피탈|자산운용/,           type: '금융기관' },
  { pattern: /외국계/,                                                     type: '외국계기업' },
];

const MIN_INTERVAL_MS = 3000;
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000;

interface CacheEntry {
  result: NamuWikiCompanyInfo | null;
  cachedAt: number;
}

@Injectable()
export class NamuWikiService {
  private readonly logger = new Logger(NamuWikiService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private pendingCount = 0;
  private runningCount = 0;

  constructor(
    private readonly puppeteer: PuppeteerService,
    @Optional() private readonly gateway?: SessionGateway,
  ) {}

  getStatus() {
    return {
      name: 'namu-wiki' as const,
      pending: this.pendingCount,
      running: this.runningCount,
      cacheSize: this.cache.size,
    };
  }

  async fetchCompanyInfo(companyName: string, { force = false } = {}): Promise<NamuWikiCompanyInfo | null> {
    const cacheKey = companyName.trim().toLowerCase();
    if (!force) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.result;
    }

    this.pendingCount++;
    this.gateway?.updateDataSourceStatus(this.getStatus());
    const result = await this.enqueue(() => this.fetchWithDelay(companyName));
    this.cache.set(cacheKey, { result, cachedAt: Date.now() });
    return result;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      this.pendingCount--;
      this.runningCount++;
      this.gateway?.updateDataSourceStatus(this.getStatus());
      try {
        return await fn();
      } finally {
        this.runningCount--;
        this.gateway?.updateDataSourceStatus(this.getStatus());
      }
    });
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async fetchWithDelay(companyName: string): Promise<NamuWikiCompanyInfo | null> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) {
      await this.sleep(MIN_INTERVAL_MS - elapsed);
    }
    this.lastRequestAt = Date.now();

    // 1단계: 이름 기반 직접 후보
    const candidates = this.buildCandidates(companyName);
    for (const title of candidates) {
      const result = await this.fetchPage(title);
      if (result) return result;
      await this.sleep(500);
    }

    // 2단계: DuckDuckGo 검색으로 NamuWiki 제목 보완
    const searchTitles = await this.searchNamuWikiTitle(companyName);
    for (const title of searchTitles) {
      if (candidates.includes(title)) continue;
      const result = await this.fetchPage(title);
      if (result) return result;
      await this.sleep(500);
    }

    return null;
  }

  /** DuckDuckGo 검색으로 NamuWiki 페이지 제목 후보 반환 */
  private async searchNamuWikiTitle(name: string): Promise<string[]> {
    try {
      const results = await this.puppeteer.searchGoogle(`${name} 나무위키 기업`, 5);
      return results
        .map((r) => {
          const m = r.url.match(/namu\.wiki\/w\/([^?#]+)/);
          return m ? decodeURIComponent(m[1]) : null;
        })
        .filter((t): t is string => t !== null && !t.includes(':') && !t.startsWith('분류'));
    } catch {
      return [];
    }
  }

  private buildCandidates(name: string): string[] {
    const cleaned = name
      .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|유한책임회사|\(재\)|재단법인|\(사\)|사단법인|그룹|홀딩스|코리아|건축사사무소/gi, '')
      .replace(/[()[\]\s]/g, '')
      .trim();
    return [...new Set([name, cleaned].filter(Boolean))];
  }

  private async fetchPage(title: string): Promise<NamuWikiCompanyInfo | null> {
    const url = `https://namu.wiki/w/${encodeURIComponent(title)}`;
    const html = await this.puppeteer.fetchRenderedHtml(
      url,
      'a[href*="/w/분류:"], .wiki-heading-1, h2',
      { waitUntil: 'networkidle2', selectorTimeout: 12000 },
    );

    if (!html) {
      this.logger.warn(`[NamuWiki] 렌더링 실패 — "${title}"`);
      return null;
    }

    // Cloudflare 차단 감지
    if (html.includes('window.__CF$cv$params') || html.includes('challenge-platform')) {
      this.logger.warn(`[NamuWiki] Cloudflare 차단 — "${title}"`);
      return null;
    }

    const $ = load(html);
    const bodyText = $('body').text();

    // 존재하지 않는 페이지 감지
    if (/이 문서는 없는 문서|존재하지 않는 문서|문서가 없습니다/.test(bodyText)) {
      this.logger.warn(`[NamuWiki] 페이지 없음 — "${title}"`);
      return null;
    }

    // 카테고리 추출 (href에서 분류명 파싱)
    const categories = $('a[href*="/w/분류:"]')
      .map((_, el) => {
        const href = $(el).attr('href') ?? '';
        const m = href.match(/\/w\/분류:(.+)/);
        return m ? decodeURIComponent(m[1]) : $(el).text().trim();
      })
      .get()
      .filter(Boolean);

    if (!this.isCompanyPage(categories, bodyText)) {
      const catStr = categories.slice(0, 5).join(', ');
      this.logger.warn(`[NamuWiki] 기업 페이지 아님 — "${title}" (분류: ${catStr || '없음'})`);
      return null;
    }

    const result = this.parse(categories, bodyText);
    if (!result.companyType) {
      const catStr = categories.slice(0, 5).join(', ');
      this.logger.warn(`[NamuWiki] companyType 파싱 실패 — "${title}" (분류: ${catStr || '없음'})`);
    }
    return result;
  }

  private isCompanyPage(categories: string[], pageText: string): boolean {
    const catJoined = categories.join(' ');
    return (
      /(기업|기관|은행|증권|병원|학교|회사|공단|공사|재단|협회|건설|건축|금융)/.test(catJoined) ||
      /기업 개요|직원\s*수|설립일|본사\s*소재지/.test(pageText) ||
      /지방공기업|공공기관|준정부기관|공기업|금융기관|대기업|중견기업|중소기업|스타트업/.test(pageText)
    );
  }

  private parse(categories: string[], pageText: string): NamuWikiCompanyInfo {
    return {
      companyType: this.parseCompanyType(categories, pageText),
      employees:   this.parseEmployees(pageText),
      foundedDate: this.parseFoundedDate(pageText),
    };
  }

  private parseCompanyType(categories: string[], pageText: string): string | null {
    for (const cat of categories) {
      for (const { pattern, type } of CATEGORY_MAP) {
        if (pattern.test(cat)) return type;
      }
    }
    for (const { pattern, type } of CATEGORY_MAP) {
      if (pattern.test(pageText)) return type;
    }
    return null;
  }

  private parseEmployees(text: string): string | null {
    const m = text.match(/(?:직원\s*수?|종업원|임직원)\s*(?:약\s*)?(\d[\d,]+)\s*명/);
    if (m) return `${m[1].replace(/,/g, '')}명`;
    return null;
  }

  private parseFoundedDate(text: string): string | null {
    const m = text.match(/설립(?:일|년도|연도)?\s*(?:\t|:|·|\s)*(\d{4})/);
    return m ? m[1] : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
