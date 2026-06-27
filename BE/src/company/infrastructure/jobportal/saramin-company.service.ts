import { Injectable, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { BrowserService } from 'src/browse/application/browser.service';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { JobPortalCompanyInfoAdapter } from './job-portal-company-info.adapter';

export interface SaraminCompanyInfo {
  companyType: string | null;
  employees: string | null;
  industry: string | null;
  foundedDate: string | null;
  address: string | null;
  homeUrl: string | null;
  ceoName: string | null;
  englishName: string | null;
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
export class SaraminCompanyService extends JobPortalCompanyInfoAdapter<SaraminCompanyInfo> {
  protected readonly sourceName = 'saramin';
  protected override readonly minIntervalMs = 3000;

  constructor(
    private readonly browser: BrowserService,
    @Optional() gateway?: SessionGateway,
  ) {
    super(gateway);
  }

  protected async doFetch(
    companyName: string,
  ): Promise<SaraminCompanyInfo | null> {
    const csn = await this.findCsn(companyName);
    if (!csn) {
      this.logger.warn(`[Saramin] CSN 조회 실패 — "${companyName}"`);
      return null;
    }

    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs)
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    this.lastRequestAt = Date.now();

    return this.fetchInfoPage(csn, companyName);
  }

  private async findCsn(companyName: string): Promise<string | null> {
    const url = `https://www.saramin.co.kr/zf_user/search?search_area=main&searchType=search&searchword=${encodeURIComponent(companyName)}&recruitPage=1&recruitSort=relation&recruitPageCount=40`;
    const html = await this.browser.fetchRenderedHtml(
      url,
      '.list_recruit .item_recruit, [data-csn]',
      { waitUntil: 'networkidle2', selectorTimeout: 8000 },
    );
    if (!html) return null;

    const $ = load(html);
    const norm = (s: string) =>
      s.replace(/[\s(주)㈜주식회사㈔유한회사]/g, '').toLowerCase();
    const target = norm(companyName);

    let csn: string | null = null;

    $('.item_recruit').each((_, el) => {
      const nameEl = $(el)
        .find('.corp_name, .company_nm, [class*="corp"]')
        .first();
      const text = nameEl.text().trim();
      const elNorm = norm(text);
      if (!text || (!elNorm.includes(target) && !target.includes(elNorm)))
        return;

      const csnAttr = $(el).attr('data-csn') ?? '';
      if (csnAttr) {
        csn = csnAttr;
        return false;
      }

      const link = $(el).find('[href*="csn="]').first();
      const m = (link.attr('href') ?? '').match(/csn=([^&]+)/);
      if (m) {
        csn = m[1];
        return false;
      }
    });

    if (!csn) {
      $('[data-csn]').each((_, el) => {
        const text = $(el).text().trim();
        const elNorm = norm(text);
        if (elNorm.includes(target) || target.includes(elNorm)) {
          csn = $(el).attr('data-csn') ?? null;
          if (csn) return false;
        }
      });
    }

    if (!csn) {
      $('[href*="csn="]').each((_, el) => {
        const text = $(el).text().trim();
        const elNorm = norm(text);
        if (elNorm.includes(target) || target.includes(elNorm)) {
          const m = ($(el).attr('href') ?? '').match(/csn=([^&]+)/);
          if (m) {
            csn = m[1];
            return false;
          }
        }
      });
    }

    return csn;
  }

  private async fetchInfoPage(
    csn: string,
    companyName: string,
  ): Promise<SaraminCompanyInfo | null> {
    const url = `https://m.saramin.co.kr/job-search/company-info-view?csn=${encodeURIComponent(csn)}`;
    const html = await this.browser.fetchRenderedHtml(url, '.list_summary', {
      waitUntil: 'networkidle2',
      selectorTimeout: 10000,
    });
    if (!html) {
      this.logger.warn(
        `[Saramin] 회사 정보 페이지 렌더링 실패 — "${companyName}"`,
      );
      return null;
    }
    return this.parseInfoPage(html, companyName);
  }

  private parseInfoPage(
    html: string,
    companyName: string,
  ): SaraminCompanyInfo | null {
    const $ = load(html);

    const info: SaraminCompanyInfo = {
      companyType: null,
      employees: null,
      industry: null,
      foundedDate: null,
      address: null,
      homeUrl: null,
      ceoName: null,
      englishName: null,
    };

    $('.summary_item').each((_, el) => {
      const label = $(el).find('.summary_label').text().trim();
      const value = $(el).find('.summary_value').text().trim();
      if (!label || !value) return;

      if (/기업\s*형태|기업\s*규모|회사\s*유형/.test(label)) {
        for (const [key, mapped] of Object.entries(SIZE_MAP)) {
          if (value.includes(key)) {
            info.companyType = mapped;
            break;
          }
        }
      } else if (/사원\s*수/.test(label)) {
        const m = value.match(/(\d[\d,]+)/);
        if (m) info.employees = m[1].replace(/,/g, '') + '명';
      } else if (/설립\s*일/.test(label)) {
        info.foundedDate = value;
      } else if (/주\s*소/.test(label)) {
        info.address = value;
      } else if (/링\s*크/.test(label)) {
        const linkEl = $(el).find('.summary_value a');
        info.homeUrl = linkEl.attr('href') ?? value;
      } else if (/대\s*표\s*자|CEO/.test(label)) {
        info.ceoName = value;
      } else if (/업\s*종|산업/.test(label)) {
        info.industry = value;
      } else if (/영문\s*명|영문\s*이름/.test(label)) {
        info.englishName = value;
      }
    });

    const hasData = !!(
      info.companyType ||
      info.employees ||
      info.industry ||
      info.foundedDate ||
      info.address ||
      info.ceoName
    );

    if (!hasData) {
      this.logger.warn(`[Saramin] 유효 데이터 없음 — "${companyName}"`);
      return null;
    }

    return info;
  }
}
