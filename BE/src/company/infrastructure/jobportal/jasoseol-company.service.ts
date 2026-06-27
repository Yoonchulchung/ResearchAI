import { Injectable, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { BrowserService } from 'src/browse/application/browser.service';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { CompanyProfileUrlResolverService } from 'src/company/application/info/company-profile-url-resolver.service';
import { JobPortalCompanyInfoAdapter } from './job-portal-company-info.adapter';

export interface JasoseolCompanyInfo {
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  address: string | null;
  industry: string | null;
}

const TYPE_MAP: Record<string, string> = {
  대기업: '대기업',
  중견기업: '중견기업',
  중소기업: '중소기업',
  공공기관: '공공기관',
  공기업: '공공기관',
  외국계: '외국계기업',
  금융: '금융기관',
  스타트업: '중소기업',
  벤처: '중소기업',
};

@Injectable()
export class JasoseolCompanyService extends JobPortalCompanyInfoAdapter<JasoseolCompanyInfo> {
  protected readonly sourceName = 'jasoseol';

  constructor(
    private readonly browser: BrowserService,
    private readonly profileUrlSearch: CompanyProfileUrlResolverService,
    @Optional() gateway?: SessionGateway,
  ) {
    super(gateway);
  }

  protected async doFetch(
    companyName: string,
  ): Promise<JasoseolCompanyInfo | null> {
    const searchEngineUrl = await this.profileUrlSearch.findUrl(companyName, {
      source: 'Jasoseol',
      domains: ['jasoseol.com'],
      keywords: ['자소설닷컴', '기업정보', '채용'],
      preferredPathPatterns: [/\/companies/i],
      rejectPathPatterns: [/\/recruit/i, /\/cover-letter/i, /\/spec/i],
    });
    const fallbackUrl = `https://jasoseol.com/companies?keyword=${encodeURIComponent(companyName)}`;
    const urls = [...new Set([searchEngineUrl, fallbackUrl].filter(Boolean))];

    for (const url of urls) {
      const html = await this.browser.fetchRenderedHtml(
        url!,
        '[class*="company"], [class*="Corp"]',
      );
      if (!html) {
        this.logger.warn(`[Jasoseol] 렌더링 실패 — "${companyName}": ${url}`);
        continue;
      }
      const parsed = this.parse(html, companyName);
      if (parsed) return parsed;
    }

    return null;
  }

  private parse(html: string, companyName: string): JasoseolCompanyInfo | null {
    const $ = load(html);
    const norm = (s: string) =>
      s.replace(/[\s(주)㈜주식회사]/g, '').toLowerCase();
    const target = norm(companyName);

    let matched: ReturnType<typeof $> | null = null;
    $('[class*="company"], [class*="Corp"], li').each((_, el) => {
      const name = $(el)
        .find('h2, h3, [class*="name"], [class*="title"]')
        .first()
        .text()
        .trim();
      if (!name) return;
      if (norm(name).includes(target) || target.includes(norm(name))) {
        matched = $(el);
        return false;
      }
    });

    if (!matched) {
      const first = $(
        '[class*="company"]:has(h2), [class*="company"]:has(h3)',
      ).first();
      if (first.length) matched = first;
    }

    if (!matched) {
      this.logger.warn(`[Jasoseol] 검색 결과 없음 — "${companyName}"`);
      return null;
    }

    const text = matched.text();
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

    const industryEl = matched.find('[class*="industry"], [class*="category"]');
    if (industryEl.length) info.industry = industryEl.text().trim() || null;

    if (!info.companyType && !info.employees) {
      this.logger.warn(`[Jasoseol] 유효 데이터 없음 — "${companyName}"`);
      return null;
    }
    return info;
  }
}
