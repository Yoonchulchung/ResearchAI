import { Injectable, Logger, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { PuppeteerService } from 'src/browse/infrastructure/puppeteer.service';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';

export interface SaraminCompanyInfo {
  companyType: string | null;
  employees: string | null;
  industry: string | null;
  foundedDate: string | null;
  address: string | null;
  homeUrl: string | null;
}

const MIN_INTERVAL_MS = 3000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  result: SaraminCompanyInfo | null;
  cachedAt: number;
}

const SIZE_MAP: Record<string, string> = {
  대기업: '대기업',
  중견기업: '중견기업',
  중소기업: '중소기업',
  공공기관: '공공기관',
  공기업: '공공기관',
  외국계기업: '외국계기업',
  외국계: '외국계기업',
  금융기관: '금융기관',
  스타트업: '중소기업',
  벤처기업: '중소기업',
  '1000대기업': '대기업',
};

@Injectable()
export class SaraminCompanyService {
  private readonly logger = new Logger(SaraminCompanyService.name);
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
      name: 'saramin' as const,
      pending: this.pendingCount,
      running: this.runningCount,
      cacheSize: this.cache.size,
    };
  }

  async fetchCompanyInfo(
    companyName: string,
    { force = false } = {},
  ): Promise<SaraminCompanyInfo | null> {
    const key = companyName.trim().toLowerCase();
    if (!force) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS)
        return cached.result;
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
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async fetchWithDelay(
    companyName: string,
  ): Promise<SaraminCompanyInfo | null> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS)
      await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    this.lastRequestAt = Date.now();
    return this.doFetch(companyName);
  }

  private async doFetch(
    companyName: string,
  ): Promise<SaraminCompanyInfo | null> {
    const url = `https://www.saramin.co.kr/zf_user/company-review?keyword=${encodeURIComponent(companyName)}`;
    const html = await this.puppeteer.fetchRenderedHtml(
      url,
      '.item .front .company, .list_company .company',
      { waitUntil: 'networkidle2', selectorTimeout: 10000 },
    );
    if (!html) {
      this.logger.warn(`[Saramin] 렌더링 실패 — "${companyName}"`);
      return null;
    }
    return this.parseResult(html, companyName);
  }

  private parseResult(
    html: string,
    companyName: string,
  ): SaraminCompanyInfo | null {
    const $ = load(html);
    const norm = (s: string) =>
      s.replace(/[\s(주)㈜주식회사]/g, '').toLowerCase();
    const target = norm(companyName);

    // .item .front 구조에서 회사명 일치 항목 찾기
    let matched: ReturnType<typeof $> | null = null;

    $('.item .front').each((_, el) => {
      const name = $(el).find('.company').first().text().trim();
      if (!name) return;
      if (norm(name).includes(target) || target.includes(norm(name))) {
        matched = $(el);
        return false;
      }
    });

    if (!matched) {
      const first = $('.item .front').first();
      if (first.length) matched = first;
    }

    if (!matched) {
      this.logger.warn(`[Saramin] 검색 결과 없음 — "${companyName}"`);
      return null;
    }

    const info: SaraminCompanyInfo = {
      companyType: null,
      employees: null,
      industry: null,
      foundedDate: null,
      address: null,
      homeUrl: null,
    };

    // .desc > .info 에서 기업 규모 및 업종 추출
    matched.find('.desc .info').each((_, el) => {
      const text = $(el).text().trim();
      for (const [key, value] of Object.entries(SIZE_MAP)) {
        if (text.includes(key)) {
          info.companyType = value;
          break;
        }
      }
      // 기업 규모가 아닌 항목은 업종으로 간주
      if (!info.companyType || info.industry === null) {
        const isType = Object.keys(SIZE_MAP).some((k) => text.includes(k));
        if (!isType && text.length > 0) info.industry = text;
      }
    });

    const fullText = matched.text();
    const empM = fullText.match(/(\d[\d,]+)\s*명/);
    if (empM) info.employees = empM[1].replace(/,/g, '') + '명';

    if (!info.companyType && !info.industry) {
      this.logger.warn(`[Saramin] 유효 데이터 없음 — "${companyName}"`);
      return null;
    }
    return info;
  }
}
