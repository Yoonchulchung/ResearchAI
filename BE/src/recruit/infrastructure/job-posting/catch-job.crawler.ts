import type { JobPosting } from '../../domain/job-posting.model';
import { normalizeJobType } from './job-type.util';

const BASE_URL = 'https://www.catch.co.kr';
const POPULAR_API_URL = `${BASE_URL}/api/v1.0/recruit/information/recruitPopularList`;
const LIST_API_URL = `${BASE_URL}/api/v1.0/recruit/information/getRecruitList`;
const POPULAR_THEME_CODE = '74';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE_URL}/NCS/RecruitSearch`,
  'x-is-pc': 'true',
};

export class CatchJobCrawler {
  async getPopularPostings(topN = 50): Promise<JobPosting[]> {
    const params = new URLSearchParams({
      themeCode: POPULAR_THEME_CODE,
      topN: String(topN),
    });

    const res = await fetch(`${POPULAR_API_URL}?${params}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const items: any[] = data?.recruitData ?? [];

    return items.map((item) => {
      const startDate = this.formatDate(item.ApplyStartDatetime);
      const endDate = this.formatDate(item.ApplyEndDatetime);
      const deadline = item.Dday != null
        ? `${endDate || '마감일 미정'} · D-${item.Dday}`
        : endDate;

      const typeParts = [item.CareerGubunCode, item.GubunCode].filter(Boolean);

      return {
        id: `catch-${item.RecruitID}`,
        url: `${BASE_URL}/NCS/RecruitInfoDetails/${item.RecruitID}`,
        company: item.CompName ?? '',
        companyType: item.PopularCategory || undefined,
        title: (item.RecruitTitle ?? '').trim(),
        type: normalizeJobType(typeParts.join(' · ')),
        location: item.WorkArea ?? '',
        startDate,
        endDate,
        deadline,
        jobs: item.Depth || undefined,
        viewCount: 0,
        collectedAt: new Date().toISOString(),
        source: 'catch' as const,
        sourceType: 'api' as const,
      } satisfies JobPosting;
    });
  }

  async getPostingsFromPage(page: number, pageSize = 30): Promise<JobPosting[]> {
    const params = new URLSearchParams({
      Keyword: '',
      JobCode: '',
      Sido: '',
      Career: '',
      JCode: '',
      Size: '',
      EduLevel: '',
      WorkPosition: '',
      CompID: '',
      GroupCode: '',
      Sort: '0',
      curpage: String(page),
      pageSize: String(pageSize),
      onRecruitYN: 'Y',
      ExceptIDList: '',
    });

    const res = await fetch(`${LIST_API_URL}?${params}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const items: any[] = data?.recruitData ?? [];

    return items.map((item) => {
      const deadline = item.ApplyEndDatetime
        ? new Date(item.ApplyEndDatetime).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).replace(/\. /g, '.').replace(/\.$/, '')
        : '';

      const jobs = item.AssignedTaskNameListString
        ? item.AssignedTaskNameListString.replace(/\s*\/-\/\s*/g, ', ').trim()
        : undefined;

      const typeParts = [item.CareerGubunCode].filter(Boolean);

      return {
        id: `catch-${item.RecruitID}`,
        url: `${BASE_URL}/NCS/RecruitInfoDetails/${item.RecruitID}`,
        company: item.CompName ?? '',
        companyType: item.PopularCategory || undefined,
        title: (item.RecruitTitle ?? '').trim(),
        type: normalizeJobType(typeParts.join(' · ')),
        location: item.WorkArea ?? '',
        deadline,
        jobs: jobs || undefined,
        viewCount: 0,
        collectedAt: new Date().toISOString(),
        source: 'catch' as const,
        sourceType: 'api' as const,
      } satisfies JobPosting;
    });
  }

  private formatDate(raw?: string | null): string {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\. /g, '.').replace(/\.$/, '');
  }
}
