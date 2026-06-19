import type { JobPosting } from 'src/recruit/domain/job-posting.model';

const BASE_URL = 'https://www.jobda.im';
const API_URL = 'https://api.jobda.im/position';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: BASE_URL,
  Referer: `${BASE_URL}/jobs`,
};

export class JobdaJobCrawler {
  async getPostingsFromPage(
    page: number,
    pageSize = 60,
  ): Promise<JobPosting[]> {
    const params = new URLSearchParams({
      page: String(page),
      size: String(pageSize),
      jobTitles: '',
      recruitments: '',
      locations: '',
      matchingYn: 'false',
      orderType: 'POPULAR',
    });

    const res = await fetch(`${API_URL}?${params}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const items: any[] = json?.positions ?? [];

    return items.map((item) => {
      const jobTitles = Array.isArray(item.jobTitleNames)
        ? item.jobTitleNames.filter(Boolean)
        : [];
      const categories = [item.jobGroupName, ...jobTitles].filter(Boolean);
      const closingAt = item.closingDateTime ?? '';

      return {
        id: `jobda-${item.positionSn}`,
        url: `${BASE_URL}/position/${item.positionSn}/jd`,
        company: item.companyName ?? '',
        title: item.jobPosting?.jobPostingName ?? item.positionName ?? '',
        type: this.getRecruitmentType(item.recruitmentType, item.positionName),
        location: this.getLocation(item.positionName),
        endDate: closingAt ? closingAt.slice(0, 10) : undefined,
        deadline: closingAt ? this.formatDate(closingAt) : '상시채용',
        jobs: jobTitles.join(', ') || undefined,
        viewCount: 0,
        collectedAt: new Date().toISOString(),
        source: 'jobda' as const,
      } satisfies JobPosting;
    });
  }

  private getRecruitmentType(type?: string, positionName?: string): string {
    if (type === 'NEW') return '신입';
    if (type === 'CAREER') return '경력';
    if (type === 'NEWORCAREER') return '신입·경력';
    if (type === 'ANY') return '경력무관';

    if (/신입\/경력|신입·경력/.test(positionName ?? '')) return '신입·경력';
    if (/신입/.test(positionName ?? '')) return '신입';
    if (/경력/.test(positionName ?? '')) return '경력';
    return '';
  }

  private getLocation(positionName?: string): string {
    const parts = (positionName ?? '')
      .split('·')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length >= 4 ? parts[parts.length - 1] : '';
  }

  private formatDate(value: string): string {
    return new Date(value)
      .toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replace(/\. /g, '.')
      .replace(/\.$/, '');
  }
}
