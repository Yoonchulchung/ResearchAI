import { randomUUID } from 'crypto';
import { IntelligentSearchService } from 'src/browse/infrastructure/search/intelligent-search.service';
import { CollectQuery, JobSource } from 'src/recruit/domain/job-source.interface';
import { JobPosting } from 'src/recruit/domain/job-posting.model';

/**
 * BrowseModule의 IntelligentSearchService를 JobSource 인터페이스로 감싸는 얇은 어댑터.
 * SourceRegistry에서 이 클래스를 사용하며, 실제 검색 로직은 모두 browse 모듈에 있습니다.
 */
export class IntelligentSearchEngine implements JobSource {
  readonly name = 'intelligent-search';
  readonly type = 'crawler' as const;

  constructor(private readonly searchService: IntelligentSearchService) {}

  isAvailable(): boolean {
    return true;
  }

  async *collect(query: CollectQuery): AsyncGenerator<JobPosting> {
    const results = await this.searchService.searchJobs(query.keyword, {
      jobTypes: query.jobTypes,
      limit: query.limit,
    });

    for (const r of results) {
      yield {
        id: randomUUID(),
        source: r.source,
        sourceType: 'crawler',
        title: r.title,
        company: r.company,
        location: '',
        description: r.type,
        skills: r.type
          ? r.type
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        url: r.url,
        deadline: r.deadline || undefined,
        postedAt: r.deadline || null,
        collectedAt: r.collectedAt,
      };
    }
  }
}
