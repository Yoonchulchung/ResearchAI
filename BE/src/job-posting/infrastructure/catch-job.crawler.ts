import type { JobPosting } from '../domain/job-posting.model';
import { normalizeJobType } from './job-type.util';

const BASE_URL = 'https://www.catch.co.kr';
const API_URL = `${BASE_URL}/api/v1.0/recruit/information/getRecruitList`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: `${BASE_URL}/NCS/RecruitSearch`,
};

export class CatchJobCrawler {
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

    const res = await fetch(`${API_URL}?${params}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const items: any[] = data?.recruitData ?? [];

    return items.map((item) => {
      const deadline = item.ApplyEndDatetime
        ? new Date(item.ApplyEndDatetime).toLocaleDateString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
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
        category: item.Depth ?? item.RecruitCategory ?? '',
        viewCount: 0,
        collectedAt: new Date().toISOString(),
        source: 'catch' as const,
      } satisfies JobPosting;
    });
  }
}
