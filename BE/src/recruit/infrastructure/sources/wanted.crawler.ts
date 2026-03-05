import { JobPosting } from '../../domain/job-posting.model';
import { CollectQuery, JobSource } from '../../domain/job-source.interface';

const BASE_URL = 'https://www.wanted.co.kr';
const API_URL = `${BASE_URL}/api/v4/jobs`;

interface WantedJob {
  id: number;
  title: string;
  company: { name: string };
  address?: { location?: string };
  due_time?: string;
  tags?: { title: string }[];
  skill_tags?: { title: string }[];
}

interface WantedResponse {
  data: WantedJob[];
  links?: { next?: string };
}

export class WantedCrawler implements JobSource {
  readonly name = 'wanted';
  readonly type = 'crawler' as const;

  isAvailable(): boolean {
    return true;
  }

  async *collect(query: CollectQuery): AsyncGenerator<JobPosting> {
    const limit = query.limit ?? 40;
    let offset = 0;
    let collected = 0;

    while (collected < limit) {
      const url = new URL(API_URL);
      url.searchParams.set('job_sort', 'job.latest_order');
      url.searchParams.set('years', '-1');
      url.searchParams.set('country', 'kr');
      url.searchParams.set('limit', '20');
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('keyword', query.keyword);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let data: WantedResponse;
      try {
        const res = await fetch(url.toString(), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Accept': 'application/json',
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL,
          },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json() as WantedResponse;
      } catch (e) {
        const name = (e as Error).name;
        throw new Error(name === 'AbortError' ? '요청 시간 초과 (10s)' : String(e));
      } finally {
        clearTimeout(timer);
      }

      if (!data.data || data.data.length === 0) break;

      for (const job of data.data) {
        if (collected >= limit) break;
        if (!job.title || !job.company?.name) continue;

        const skills = [
          ...(job.tags ?? []).map((t) => t.title),
          ...(job.skill_tags ?? []).map((t) => t.title),
        ];

        yield {
          id: `wanted-${job.id}`,
          source: 'wanted',
          sourceType: 'crawler',
          title: job.title,
          company: job.company?.name ?? '',
          location: job.address?.location ?? '',
          description: '',
          skills,
          url: `${BASE_URL}/wd/${job.id}`,
          postedAt: null,
          collectedAt: new Date().toISOString(),
        };

        collected++;
      }

      if (!data.links?.next || data.data.length < 20) break;
      offset += 20;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
