import type { JobPosting } from 'src/recruit/domain/job-posting.model';
import type {
  JobPostingCrawlerSource,
  JobPostingDetail,
  JobPostingDetailRequest,
  JobPostingPageRequest,
} from 'src/recruit/application/job-posting/job-posting-crawler.types';

/**
 * 채용 사이트 crawler와 application 계층 사이의 교체 가능한 경계입니다.
 *
 * 각 사이트의 URL, API/HTML 파싱, 인증 헤더는 infrastructure 구현 내부에 숨깁니다.
 * 새 사이트는 이 계약을 구현하고 registry에 등록하면 수집 엔진 변경 없이 추가됩니다.
 */
export abstract class JobPostingCrawlerPort {
  abstract readonly source: JobPostingCrawlerSource;

  /** 사이트의 한 페이지를 공통 JobPosting 모델로 변환합니다. */
  abstract getPostingsFromPage(
    request: JobPostingPageRequest,
  ): Promise<JobPosting[]>;

  /** 인기 공고 API가 있는 사이트만 재정의합니다. */
  getPopularPostings(limit: number): Promise<JobPosting[]> {
    void limit;
    return Promise.resolve([]);
  }

  /** crawler가 상세 페이지 파싱을 지원할 때만 재정의합니다. */
  getDetail(request: JobPostingDetailRequest): Promise<JobPostingDetail> {
    void request;
    return Promise.resolve({});
  }
}

/**
 * application 서비스가 concrete registry 위치를 몰라도 crawler를 찾게 하는 계약입니다.
 */
export abstract class JobPostingCrawlerRegistryPort {
  abstract get(source: JobPostingCrawlerSource): JobPostingCrawlerPort;
  abstract getAll(): JobPostingCrawlerPort[];
}
