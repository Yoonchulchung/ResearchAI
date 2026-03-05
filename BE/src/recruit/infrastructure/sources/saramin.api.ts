import { JobPosting } from '../../domain/job-posting.model';
import { CollectQuery, JobSource } from '../../domain/job-source.interface';

/**
 * 사람인 Open API
 * https://oapi.saramin.co.kr
 * API 키 발급 후 SARAMIN_API_KEY 환경변수에 설정
 */
export class SaraminApi implements JobSource {
  readonly name = 'saramin-api';
  readonly type = 'api' as const;

  isAvailable(): boolean {
    return !!process.env.SARAMIN_API_KEY;
  }

  async *collect(query: CollectQuery): AsyncGenerator<JobPosting> {
    const apiKey = process.env.SARAMIN_API_KEY!;
    const limit = query.limit ?? 100;
    let start = 0;
    let collected = 0;

    while (collected < limit) {
      const url = new URL('https://oapi.saramin.co.kr/job-search');
      url.searchParams.set('access-key', apiKey);
      url.searchParams.set('keywords', query.keyword);
      url.searchParams.set('start', String(start));
      url.searchParams.set('count', '100');
      url.searchParams.set('sort', 'pd');
      if (query.location) url.searchParams.set('loc_mcd', query.location);

      let data: any;
      try {
        const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
        if (!res.ok) break;
        data = await res.json();
      } catch {
        break;
      }

      const jobs: any[] = data?.jobs?.job ?? [];
      if (jobs.length === 0) break;

      for (const job of jobs) {
        if (collected >= limit) break;

        const skills = (job.keyword ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);

        yield {
          id: `saramin-api-${job.id}`,
          source: 'saramin-api',
          sourceType: 'api',
          title: job.position?.title ?? '',
          company: job.company?.detail?.name ?? '',
          location: job.position?.location?.name ?? '',
          description: job.position?.job_type?.name ?? '',
          skills,
          url: job.url ?? '',
          postedAt: job.posting_date ?? null,
          collectedAt: new Date().toISOString(),
        };

        collected++;
      }

      if (jobs.length < 100) break;
      start += 100;
    }
  }
}
