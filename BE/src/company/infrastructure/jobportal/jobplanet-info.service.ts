import { Injectable, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { BrowserService } from 'src/browse/application/browser.service';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import {
  buildCompanySearchQuery,
  isCompanyNameMatch,
} from 'src/company/application/info/company-name-search.util';
import { CompanyProfileUrlResolverService } from 'src/company/application/info/company-profile-url-resolver.service';
import { JobPortalCompanyInfoAdapter } from './job-portal-company-info.adapter';

export interface JobplanetInfoCompanyInfo {
  companyType: string | null;
  employees: string | null;
  industry: string | null;
}

const TYPE_PATTERNS: { re: RegExp; type: string }[] = [
  { re: /기업\s*규모\s*[:\s]*(대기업)/, type: '대기업' },
  { re: /기업\s*규모\s*[:\s]*(중견기업)/, type: '중견기업' },
  { re: /기업\s*규모\s*[:\s]*(중소기업)/, type: '중소기업' },
  { re: /기업\s*규모\s*[:\s]*(외국계)/, type: '외국계기업' },
  { re: /기업\s*규모\s*[:\s]*(공공기관|공기업)/, type: '공공기관' },
  { re: /기업\s*규모\s*[:\s]*(금융기관|은행|증권|보험)/, type: '금융기관' },
];

@Injectable()
export class JobplanetInfoService extends JobPortalCompanyInfoAdapter<JobplanetInfoCompanyInfo> {
  protected readonly sourceName = 'jobplanet-info';

  constructor(
    private readonly browser: BrowserService,
    private readonly profileUrlSearch: CompanyProfileUrlResolverService,
    @Optional() gateway?: SessionGateway,
  ) {
    super(gateway);
  }

  protected async doFetch(
    companyName: string,
  ): Promise<JobplanetInfoCompanyInfo | null> {
    const pageUrl = await this.searchCompanyUrl(companyName);
    if (!pageUrl) {
      this.logger.warn(`[Jobplanet] 검색 결과 없음 — "${companyName}"`);
      return null;
    }

    await new Promise((r) => setTimeout(r, 500));

    const html = await this.browser.fetchRenderedHtml(
      pageUrl,
      '[class*="company"], [class*="CompanyInfo"], [class*="info"]',
      { waitUntil: 'networkidle2', selectorTimeout: 12000 },
    );

    if (!html) {
      this.logger.warn(`[Jobplanet] 렌더링 실패 — "${companyName}"`);
      return null;
    }

    if (
      html.includes('window.__CF$cv$params') ||
      html.includes('challenge-platform')
    ) {
      this.logger.warn(`[Jobplanet] Cloudflare 차단 — "${companyName}"`);
      return null;
    }

    const $ = load(html);
    const pageText = $('body').text().replace(/\s+/g, ' ');

    if (/로그인이\s*필요|sign.?in|login/i.test(pageText.slice(0, 500))) {
      this.logger.warn(`[Jobplanet] 로그인 페이지 — "${companyName}"`);
      return null;
    }

    const result = this.parse(pageText);
    if (!result) {
      this.logger.warn(`[Jobplanet] 유효 데이터 없음 — "${companyName}"`);
    }
    return result;
  }

  private async searchCompanyUrl(name: string): Promise<string | null> {
    const searchEngineUrl = await this.profileUrlSearch.findUrl(name, {
      source: 'Jobplanet',
      domains: ['jobplanet.co.kr'],
      keywords: ['잡플래닛', '기업정보', '리뷰'],
      preferredPathPatterns: [/\/companies\/\d+\//],
      rejectPathPatterns: [/\/job_postings\//, /\/contents\//],
    });
    if (searchEngineUrl) {
      const normalized = this.toLandingUrl(searchEngineUrl);
      if (normalized) return normalized;
    }

    try {
      const query = buildCompanySearchQuery(
        name,
        'site:jobplanet.co.kr companies',
      );
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;

      const $ = load(await res.text());
      const landingUrls: { url: string; score: number }[] = [];
      const reviewUrls: { url: string; score: number }[] = [];

      $('.result .result__a').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const title = $(el).text() ?? '';
        const m = href.match(/uddg=([^&]+)/);
        if (!m) return;
        const decoded = decodeURIComponent(m[1]);
        if (!decoded.includes('jobplanet.co.kr/companies/')) return;

        const landingUrl = this.toLandingUrl(decoded);
        if (!landingUrl) return;

        const type = decoded.includes('/landing/') ? 'landing' : 'reviews';
        const slug = landingUrl.split('/').pop() ?? '';
        const decodedSlug = decodeURIComponent(slug);
        const score =
          isCompanyNameMatch(name, title) ||
          isCompanyNameMatch(name, decodedSlug)
            ? 2
            : 1;
        if (type === 'landing') landingUrls.push({ url: landingUrl, score });
        else reviewUrls.push({ url: landingUrl, score });
      });

      landingUrls.sort((a, b) => b.score - a.score);
      reviewUrls.sort((a, b) => b.score - a.score);
      return landingUrls[0]?.url ?? reviewUrls[0]?.url ?? null;
    } catch {
      return null;
    }
  }

  private toLandingUrl(href: string): string | null {
    try {
      const url = new URL(href);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'companies' || !parts[1]) return null;
      const id = parts[1];
      const slug = parts.slice(3).join('/');
      url.hostname = 'www.jobplanet.co.kr';
      url.pathname = slug
        ? `/companies/${id}/landing/${slug}`
        : `/companies/${id}/landing`;
      url.search = '';
      return url.toString();
    } catch {
      return null;
    }
  }

  private parse(pageText: string): JobplanetInfoCompanyInfo | null {
    let companyType: string | null = null;
    for (const { re, type } of TYPE_PATTERNS) {
      if (re.test(pageText)) {
        companyType = type;
        break;
      }
    }

    const empM = pageText.match(
      /(?:임)?직원\s*수?\s*[:\s]\s*(?:약\s*)?(\d[\d,]+)\s*명/,
    );
    const employees = empM ? empM[1].replace(/,/g, '') + '명' : null;

    if (!companyType && employees) {
      const count = parseInt(employees.replace(/[^0-9]/g, ''), 10);
      if (count >= 5000) companyType = '대기업';
      else if (count >= 1000) companyType = '중견기업';
      else if (count > 0) companyType = '중소기업';
    }

    const indM = pageText.match(
      /(?:업종|산업)\s*[:\s]\s*([^\n,|]+?)(?:\s*\||\s*\n|기업\s*규모|직원)/,
    );
    const industry = indM ? indM[1].trim() : null;

    if (!companyType && !employees && !industry) return null;
    return { companyType, employees, industry };
  }
}
