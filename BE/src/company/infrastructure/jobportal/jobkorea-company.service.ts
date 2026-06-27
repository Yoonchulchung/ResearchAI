import { Injectable, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import {
  buildCompanySearchQuery,
  isCompanyNameMatch,
  normalizeCompanyNameForMatch,
} from 'src/company/application/info/company-name-search.util';
import { CompanyProfileUrlResolverService } from 'src/company/application/info/company-profile-url-resolver.service';
import { JobPortalCompanyInfoAdapter } from './job-portal-company-info.adapter';

export interface JobkoreaCompanyInfo {
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  industry: string | null;
  address: string | null;
  homeUrl: string | null;
  englishName: string | null;
}

const TYPE_MAP: Record<string, string> = {
  대기업: '대기업',
  중견기업: '중견기업',
  중소기업: '중소기업',
  공기업: '공공기관',
  공공기관: '공공기관',
  외국계기업: '외국계기업',
  외국계: '외국계기업',
  금융기관: '금융기관',
  '1000대기업': '대기업',
};

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://www.jobkorea.co.kr/',
};

@Injectable()
export class JobkoreaCompanyService extends JobPortalCompanyInfoAdapter<JobkoreaCompanyInfo> {
  protected readonly sourceName = 'jobkorea';
  protected override readonly minIntervalMs = 2000;

  constructor(
    private readonly profileUrlSearch: CompanyProfileUrlResolverService,
    @Optional() gateway?: SessionGateway,
  ) {
    super(gateway);
  }

  protected async doFetch(
    companyName: string,
  ): Promise<JobkoreaCompanyInfo | null> {
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
      this.logger.warn(
        `[Jobkorea] 요청 오류 — "${companyName}": ${(e as Error).message}`,
      );
      return null;
    }
  }

  private async searchCompanyUrl(name: string): Promise<string | null> {
    const searchEngineUrl = await this.profileUrlSearch.findUrl(name, {
      source: 'JobKorea',
      domains: ['jobkorea.co.kr'],
      keywords: ['잡코리아', '기업정보'],
      preferredPathPatterns: [/\/company\/\d+/, /\/recruit\/co_read\//i],
      rejectPathPatterns: [/\/recruit\/gi_read\//i, /\/Search\//i],
    });
    if (searchEngineUrl) {
      const normalized = this.toCompanyInfoUrl(searchEngineUrl);
      if (normalized) return normalized;
    }

    try {
      const companyUrls: { url: string; score: number }[] = [];
      const coReadUrls: { url: string; score: number }[] = [];
      const queries = [
        `${name} JobKorea`,
        `${name} site:jobkorea.co.kr`,
        buildCompanySearchQuery(name, 'site:jobkorea.co.kr JobKorea'),
        buildCompanySearchQuery(name, 'site:jobkorea.co.kr 기업정보'),
      ];
      const seenQuery = new Set<string>();

      for (const query of queries) {
        if (seenQuery.has(query)) continue;
        seenQuery.add(query);
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr`;
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'text/html',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;

        const $ = load(await res.text());

        $('.result .result__a').each((_, el) => {
          const href = $(el).attr('href') ?? '';
          const title = $(el).text() ?? '';
          const m = href.match(/uddg=([^&]+)/);
          if (!m) return;
          const decoded = decodeURIComponent(m[1]);
          if (!decoded.includes('jobkorea.co.kr')) return;
          const score =
            isCompanyNameMatch(name, title) || isCompanyNameMatch(name, decoded)
              ? 2
              : 1;

          const companyM = decoded.match(/jobkorea\.co\.kr\/company\/(\d+)/i);
          if (companyM) {
            companyUrls.push({
              url: `https://www.jobkorea.co.kr/company/${companyM[1]}`,
              score,
            });
            return;
          }
          const coReadM = decoded.match(
            /jobkorea\.co\.kr\/[Rr]ecruit\/[Cc]o_[Rr]ead(?:\/\w+)?\/[Cc]\/([^/?#]+)/i,
          );
          if (coReadM) {
            coReadUrls.push({
              url: `https://www.jobkorea.co.kr/recruit/co_read/c/${coReadM[1]}`,
              score,
            });
          }
        });

        if (companyUrls.length || coReadUrls.length) break;
      }

      companyUrls.sort((a, b) => b.score - a.score);
      coReadUrls.sort((a, b) => b.score - a.score);
      return companyUrls[0]?.url ?? coReadUrls[0]?.url ?? null;
    } catch {
      return null;
    }
  }

  private toCompanyInfoUrl(href: string): string | null {
    try {
      const url = new URL(href);
      const companyM = url.pathname.match(/\/company\/(\d+)/i);
      if (companyM) return `https://www.jobkorea.co.kr/company/${companyM[1]}`;

      const coReadM = url.pathname.match(
        /\/recruit\/co_read(?:\/\w+)?\/c\/([^/?#]+)/i,
      );
      if (coReadM) {
        return `https://www.jobkorea.co.kr/recruit/co_read/c/${coReadM[1]}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  private parse(html: string, companyName: string): JobkoreaCompanyInfo | null {
    const $ = load(html);
    const pageTitle = $('title')
      .text()
      .replace(/\d{4}년.*$/, '')
      .trim();
    if (
      pageTitle &&
      !normalizeCompanyNameForMatch(pageTitle).includes(
        normalizeCompanyNameForMatch(companyName),
      ) &&
      !normalizeCompanyNameForMatch(companyName).includes(
        normalizeCompanyNameForMatch(pageTitle),
      )
    ) {
      this.logger.warn(
        `[Jobkorea] 회사명 불일치 — 검색: "${companyName}", 페이지: "${pageTitle}"`,
      );
    }

    const info: JobkoreaCompanyInfo = {
      companyType: null,
      employees: null,
      foundedDate: null,
      industry: null,
      address: null,
      homeUrl: null,
      englishName: null,
    };

    $('table.table-basic-infomation-primary th.field-label').each((_, th) => {
      const label = $(th).text().trim();
      const td = $(th).next('td');
      const value = td.find('.value').first().text().trim();
      if (!value || value === '-') return;

      switch (label) {
        case '기업구분':
          for (const [k, v] of Object.entries(TYPE_MAP)) {
            if (value.includes(k)) {
              info.companyType = v;
              break;
            }
          }
          break;
        case '사원수':
          info.employees =
            value.replace(/,/g, '').replace(/명.*/, '명') || null;
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
        case '영문명':
          info.englishName = value || null;
          break;
      }
    });

    if (!info.companyType && info.employees) {
      info.companyType = this.inferCompanyTypeFromEmployees(info.employees);
    }

    if (!info.companyType && !info.employees && !info.industry) {
      this.logger.warn(`[Jobkorea] 유효 데이터 없음 — "${companyName}"`);
      return null;
    }
    return info;
  }

  private inferCompanyTypeFromEmployees(employees: string): string | null {
    const count = parseInt(employees.replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    if (count >= 5000) return '대기업';
    if (count >= 1000) return '중견기업';
    return '중소기업';
  }
}
