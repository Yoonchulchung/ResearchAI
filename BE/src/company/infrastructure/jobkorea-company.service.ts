import { Injectable, Logger, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { SessionGateway } from '../../sessions/presentation/session.gateway';

export interface JobkoreaCompanyInfo {
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  industry: string | null;
  address: string | null;
  homeUrl: string | null;
}

const TYPE_MAP: Record<string, string> = {
  '대기업': '대기업',
  '중견기업': '중견기업',
  '중소기업': '중소기업',
  '공기업': '공공기관',
  '공공기관': '공공기관',
  '외국계기업': '외국계기업',
  '외국계': '외국계기업',
  '금융기관': '금융기관',
  '1000대기업': '대기업',
};

const MIN_INTERVAL_MS = 2000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.jobkorea.co.kr/',
};

interface CacheEntry { result: JobkoreaCompanyInfo | null; cachedAt: number }

@Injectable()
export class JobkoreaCompanyService {
  private readonly logger = new Logger(JobkoreaCompanyService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private pendingCount = 0;
  private runningCount = 0;

  constructor(@Optional() private readonly gateway?: SessionGateway) {}

  getStatus() {
    return {
      name: 'jobkorea' as const,
      pending: this.pendingCount,
      running: this.runningCount,
      cacheSize: this.cache.size,
    };
  }

  async fetchCompanyInfo(companyName: string, { force = false } = {}): Promise<JobkoreaCompanyInfo | null> {
    const key = companyName.trim().toLowerCase();
    if (!force) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.result;
    }

    this.pendingCount++;
    this.gateway?.updateDataSourceStatus(this.getStatus());
    const result = await this.enqueue(() => this.fetchWithDelay(companyName));
    this.cache.set(key, { result, cachedAt: Date.now() });
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

  private async fetchWithDelay(companyName: string): Promise<JobkoreaCompanyInfo | null> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    this.lastRequestAt = Date.now();
    return this.doFetch(companyName);
  }

  private async doFetch(companyName: string): Promise<JobkoreaCompanyInfo | null> {
    const pageUrl = await this.searchCompanyUrl(companyName);
    if (!pageUrl) {
      this.logger.warn(`[Jobkorea] 검색 결과 없음 — "${companyName}"`);
      return null;
    }

    await new Promise((r) => setTimeout(r, 500));

    try {
      const res = await fetch(pageUrl, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.warn(`[Jobkorea] HTTP ${res.status} — "${companyName}"`);
        return null;
      }
      return this.parse(await res.text(), companyName);
    } catch (e) {
      this.logger.warn(`[Jobkorea] 요청 오류 — "${companyName}": ${(e as Error).message}`);
      return null;
    }
  }

  /** DuckDuckGo HTML 검색으로 잡코리아 기업 페이지 URL 탐색 */
  private async searchCompanyUrl(name: string): Promise<string | null> {
    try {
      const query = `"${name}" site:jobkorea.co.kr 기업정보`;
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;

      const $ = load(await res.text());
      const companyUrls: string[] = [];
      const coReadUrls: string[] = [];

      $('.result .result__a').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const m = href.match(/uddg=([^&]+)/);
        if (!m) return;
        const decoded = decodeURIComponent(m[1]);
        if (!decoded.includes('jobkorea.co.kr')) return;

        // /company/{numericId} 형식 (신형)
        const companyM = decoded.match(/jobkorea\.co\.kr\/company\/(\d+)/i);
        if (companyM) {
          companyUrls.push(`https://www.jobkorea.co.kr/company/${companyM[1]}`);
          return;
        }
        // /recruit/co_read/c/{id} 형식 (구형)
        const coReadM = decoded.match(/jobkorea\.co\.kr\/[Rr]ecruit\/[Cc]o_[Rr]ead(?:\/\w+)?\/[Cc]\/([^/?#]+)/i);
        if (coReadM) {
          coReadUrls.push(`https://www.jobkorea.co.kr/recruit/co_read/c/${coReadM[1]}`);
        }
      });

      // 신형 URL 우선, 없으면 구형 사용
      return companyUrls[0] ?? coReadUrls[0] ?? null;
    } catch {
      return null;
    }
  }

  private parse(html: string, companyName: string): JobkoreaCompanyInfo | null {
    const $ = load(html);
    const norm = (s: string) => s.replace(/[\s(주)㈜주식회사(유)유한회사]/g, '').toLowerCase();
    const pageTitle = $('title').text().replace(/\d{4}년.*$/, '').trim();
    if (pageTitle && !norm(pageTitle).includes(norm(companyName)) && !norm(companyName).includes(norm(pageTitle))) {
      this.logger.warn(`[Jobkorea] 회사명 불일치 — 검색: "${companyName}", 페이지: "${pageTitle}"`);
    }

    const info: JobkoreaCompanyInfo = {
      companyType: null,
      employees: null,
      foundedDate: null,
      industry: null,
      address: null,
      homeUrl: null,
    };

    $('table.table-basic-infomation-primary th.field-label').each((_, th) => {
      const label = $(th).text().trim();
      const td = $(th).next('td');
      const value = td.find('.value').first().text().trim();
      if (!value || value === '-') return;

      switch (label) {
        case '기업구분':
          for (const [k, v] of Object.entries(TYPE_MAP)) {
            if (value.includes(k)) { info.companyType = v; break; }
          }
          break;
        case '사원수':
          info.employees = value.replace(/,/g, '').replace(/명.*/, '명') || null;
          break;
        case '설립일':
          info.foundedDate = value.match(/\d{4}/)?.[0] ?? null;
          break;
        case '산업':
          info.industry = value || null;
          break;
        case '주소':
          info.address = value || null;
          break;
        case '홈페이지': {
          const link = td.find('a').first().attr('href');
          info.homeUrl = link ?? null;
          break;
        }
      }
    });

    if (!info.companyType && !info.employees && !info.industry) {
      this.logger.warn(`[Jobkorea] 유효 데이터 없음 — "${companyName}"`);
      return null;
    }
    return info;
  }
}
