import type { JobPosting } from '../../domain/job-posting.model';
import { normalizeJobType } from './job-type.util';

const BASE_URL = 'https://www.jobplanet.co.kr';
const API_URL = `${BASE_URL}/api/v3/job/postings`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE_URL}/job`,
  'Sec-Ch-Ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'jp-os-type': 'web',
  'jp-ssr-auth': 'jobplanet_desktop_ssr_1d6f8a5f219176accbb8fe051729fc6a',
};

export class JobplanetJobCrawler {
  async getPostingsFromPage(page: number, pageSize = 8): Promise<JobPosting[]> {
    const params = new URLSearchParams({
      occupation_level1: '11600',
      occupation_level2: '11928',
      years_of_experience: '0,0',
      review_score: '',
      job_type: '',
      city: '',
      education_level_id: '',
      order_by: 'aggressive',
      page: String(page),
      page_size: String(pageSize),
    });

    const res = await fetch(`${API_URL}?${params}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await this.getErrorPreview(res)}`);

    const json = await res.json();
    const items: any[] = json?.data?.recruits ?? [];

    return items.map((item) => {
      const endAt = item.end_at ?? '';
      const deadline = endAt
        ? new Date(endAt).toLocaleDateString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
          }).replace(/\. /g, '.').replace(/\.$/, '')
        : item.deadline_message ?? '';

      const occupations: string[] = [
        ...(item.occupation_names?.level1 ?? []),
        ...(item.occupation_names?.level2 ?? []),
      ].filter((v, i, arr) => arr.indexOf(v) === i);

      return {
        id: `jp-${item.id}`,
        url: `${BASE_URL}/job/search?posting_ids[]=${item.id}`,
        company: item.company?.name ?? '',
        title: (item.title ?? '').trim(),
        type: this.getJobType(item),
        location: item.company?.city_name ?? '',
        startDate: item.start_at ?? undefined,
        endDate: endAt || undefined,
        deadline,
        category: occupations.join(', '),
        viewCount: 0,
        collectedAt: new Date().toISOString(),
        source: 'jobplanet' as const,
      } satisfies JobPosting;
    });
  }

  private getHeaders(): HeadersInit {
    const cookie = process.env.JOBPLANET_COOKIE?.trim();
    return {
      ...HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    };
  }

  private async getErrorPreview(res: Response): Promise<string> {
    try {
      return (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 200);
    } catch {
      return res.statusText;
    }
  }

  private getJobType(item: any): string {
    const annualYears = Number(item.annual?.years);
    const maximumYears = Number(item.annual?.maximum_years);
    const annualText = item.annual?.text ?? '';
    const recruitmentText = Array.isArray(item.recruitment_text)
      ? item.recruitment_text.join(' ')
      : '';
    const raw = [annualText, recruitmentText, item.title].filter(Boolean).join(' ');

    if (annualYears === 0 && maximumYears === 0) {
      if (/경력무관/.test(raw)) return '신입';
      return normalizeJobType(raw) || '신입';
    }

    return normalizeJobType(raw) || normalizeJobType(item.job_type ?? '');
  }
}
