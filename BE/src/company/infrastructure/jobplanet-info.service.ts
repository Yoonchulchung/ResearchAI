import { Injectable, Logger, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { PuppeteerService } from '../../browse/infrastructure/puppeteer.service';
import { SessionGateway } from '../../sessions/presentation/session.gateway';

export interface JobplanetInfoCompanyInfo {
  companyType: string | null;
  employees: string | null;
  industry: string | null;
}

const TYPE_PATTERNS: { re: RegExp; type: string }[] = [
  { re: /기업\s*규모\s*[:\s]*(대기업)/,                 type: '대기업' },
  { re: /기업\s*규모\s*[:\s]*(중견기업)/,                type: '중견기업' },
  { re: /기업\s*규모\s*[:\s]*(중소기업)/,                type: '중소기업' },
  { re: /기업\s*규모\s*[:\s]*(외국계)/,                  type: '외국계기업' },
  { re: /기업\s*규모\s*[:\s]*(공공기관|공기업)/,         type: '공공기관' },
  { re: /기업\s*규모\s*[:\s]*(금융기관|은행|증권|보험)/, type: '금융기관' },
];

const MIN_INTERVAL_MS = 3000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry { result: JobplanetInfoCompanyInfo | null; cachedAt: number }

@Injectable()
export class JobplanetInfoService {
  private readonly logger = new Logger(JobplanetInfoService.name);
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
      name: 'jobplanet-info' as const,
      pending: this.pendingCount,
      running: this.runningCount,
      cacheSize: this.cache.size,
    };
  }

  async fetchCompanyInfo(companyName: string, { force = false } = {}): Promise<JobplanetInfoCompanyInfo | null> {
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

  private async fetchWithDelay(companyName: string): Promise<JobplanetInfoCompanyInfo | null> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    this.lastRequestAt = Date.now();
    return this.doFetch(companyName);
  }

  private async doFetch(companyName: string): Promise<JobplanetInfoCompanyInfo | null> {
    const pageUrl = await this.searchCompanyUrl(companyName);
    if (!pageUrl) {
      this.logger.warn(`[Jobplanet] 검색 결과 없음 — "${companyName}"`);
      return null;
    }

    await new Promise((r) => setTimeout(r, 500));

    const html = await this.puppeteer.fetchRenderedHtml(
      pageUrl,
      '[class*="company"], [class*="CompanyInfo"], [class*="info"]',
      { waitUntil: 'networkidle2', selectorTimeout: 12000 },
    );

    if (!html) {
      this.logger.warn(`[Jobplanet] 렌더링 실패 — "${companyName}"`);
      return null;
    }

    if (html.includes('window.__CF$cv$params') || html.includes('challenge-platform')) {
      this.logger.warn(`[Jobplanet] Cloudflare 차단 — "${companyName}"`);
      return null;
    }

    const $ = load(html);
    const pageText = $('body').text().replace(/\s+/g, ' ');

    // 로그인 페이지로 리다이렉트된 경우
    if (/로그인이\s*필요|sign.?in|login/i.test(pageText.slice(0, 500))) {
      this.logger.warn(`[Jobplanet] 로그인 페이지 — "${companyName}"`);
      return null;
    }

    const result = this.parse(pageText, companyName);
    if (!result) {
      this.logger.warn(`[Jobplanet] 유효 데이터 없음 — "${companyName}"`);
    }
    return result;
  }

  /** DuckDuckGo HTML 검색으로 잡플래닛 랜딩 URL 탐색 */
  private async searchCompanyUrl(name: string): Promise<string | null> {
    try {
      const query = `"${name}" site:jobplanet.co.kr companies`;
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;

      const $ = load(await res.text());
      const landingUrls: string[] = [];
      const reviewUrls: string[] = [];

      $('.result .result__a').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const m = href.match(/uddg=([^&]+)/);
        if (!m) return;
        const decoded = decodeURIComponent(m[1]);
        if (!decoded.includes('jobplanet.co.kr/companies/')) return;

        const idMatch = decoded.match(/jobplanet\.co\.kr\/companies\/(\d+)\/(landing|reviews)\/([^?#]+)/i);
        if (!idMatch) return;

        const [, id, type, slug] = idMatch;
        const landingUrl = `https://www.jobplanet.co.kr/companies/${id}/landing/${slug}`;
        if (type === 'landing') landingUrls.push(landingUrl);
        else reviewUrls.push(landingUrl);
      });

      return landingUrls[0] ?? reviewUrls[0] ?? null;
    } catch {
      return null;
    }
  }

  private parse(pageText: string, companyName: string): JobplanetInfoCompanyInfo | null {
    let companyType: string | null = null;
    for (const { re, type } of TYPE_PATTERNS) {
      if (re.test(pageText)) { companyType = type; break; }
    }

    // 직원 수 (직원 수 : 1,234명 또는 임직원 수 : ~)
    const empM = pageText.match(/(?:임)?직원\s*수?\s*[:\s]\s*(?:약\s*)?(\d[\d,]+)\s*명/);
    const employees = empM ? empM[1].replace(/,/g, '') + '명' : null;

    // 직원 수로 기업 규모 추론 (기업 규모 필드가 없는 경우)
    if (!companyType && employees) {
      const count = parseInt(employees);
      if (count >= 5000) companyType = '대기업';
      else if (count >= 1000) companyType = '중견기업';
      else if (count >= 100) companyType = '중소기업';
    }

    // 업종/산업 (산업 : IT·인터넷 또는 업종 : ...)
    const indM = pageText.match(/(?:업종|산업)\s*[:\s]\s*([^\n,|]+?)(?:\s*\||\s*\n|기업\s*규모|직원)/);
    const industry = indM ? indM[1].trim() : null;

    if (!companyType && !employees) return null;
    return { companyType, employees, industry };
  }
}
