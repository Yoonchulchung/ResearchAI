import { Injectable, Logger, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { PuppeteerService } from '../../browse/infrastructure/puppeteer.service';
import { SessionGateway } from '../../sessions/presentation/session.gateway';

export interface JasoseolCompanyInfo {
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  address: string | null;
  industry: string | null;
}

const TYPE_MAP: Record<string, string> = {
  '대기업': '대기업',
  '중견기업': '중견기업',
  '중소기업': '중소기업',
  '공공기관': '공공기관',
  '공기업': '공공기관',
  '외국계': '외국계기업',
  '금융': '금융기관',
  '스타트업': '중소기업',
  '벤처': '중소기업',
};

const MIN_INTERVAL_MS = 3000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry { result: JasoseolCompanyInfo | null; cachedAt: number }

@Injectable()
export class JasoseolCompanyService {
  private readonly logger = new Logger(JasoseolCompanyService.name);
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
      name: 'jasoseol' as const,
      pending: this.pendingCount,
      running: this.runningCount,
      cacheSize: this.cache.size,
    };
  }

  async fetchCompanyInfo(companyName: string, { force = false } = {}): Promise<JasoseolCompanyInfo | null> {
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

  private async fetchWithDelay(companyName: string): Promise<JasoseolCompanyInfo | null> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    this.lastRequestAt = Date.now();
    return this.doFetch(companyName);
  }

  private async doFetch(companyName: string): Promise<JasoseolCompanyInfo | null> {
    const url = `https://jasoseol.com/companies?keyword=${encodeURIComponent(companyName)}`;
    const html = await this.puppeteer.fetchRenderedHtml(url, '[class*="company"], [class*="Corp"]');
    if (!html) {
      this.logger.warn(`[Jasoseol] 렌더링 실패 — "${companyName}"`);
      return null;
    }
    return this.parse(html, companyName);
  }

  private parse(html: string, companyName: string): JasoseolCompanyInfo | null {
    const $ = load(html);
    const norm = (s: string) => s.replace(/[\s(주)㈜주식회사]/g, '').toLowerCase();
    const target = norm(companyName);

    let matched: ReturnType<typeof $> | null = null;
    $('[class*="company"], [class*="Corp"], li').each((_, el) => {
      const name = $(el).find('h2, h3, [class*="name"], [class*="title"]').first().text().trim();
      if (!name) return;
      if (norm(name).includes(target) || target.includes(norm(name))) {
        matched = $(el);
        return false;
      }
    });

    if (!matched) {
      const first = $('[class*="company"]:has(h2), [class*="company"]:has(h3)').first();
      if (first.length) matched = first;
    }

    if (!matched) {
      this.logger.warn(`[Jasoseol] 검색 결과 없음 — "${companyName}"`);
      return null;
    }

    const text = (matched as ReturnType<typeof $>).text();
    const info: JasoseolCompanyInfo = {
      companyType: null,
      employees: null,
      foundedDate: null,
      address: null,
      industry: null,
    };

    for (const [key, value] of Object.entries(TYPE_MAP)) {
      if (text.includes(key)) {
        info.companyType = value;
        break;
      }
    }

    const empM = text.match(/(\d[\d,]+)\s*명/);
    if (empM) info.employees = empM[1].replace(/,/g, '') + '명';

    const foundedM = text.match(/설립\s*[:\s]*(\d{4})/);
    if (foundedM) info.foundedDate = foundedM[1];

    const industryEl = (matched as ReturnType<typeof $>).find('[class*="industry"], [class*="category"]');
    if (industryEl.length) info.industry = industryEl.text().trim() || null;

    if (!info.companyType && !info.employees) {
      this.logger.warn(`[Jasoseol] 유효 데이터 없음 — "${companyName}"`);
      return null;
    }
    return info;
  }
}
