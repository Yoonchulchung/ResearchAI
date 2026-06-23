import { Injectable } from '@nestjs/common';
import {
  JobPostingCrawlerPort,
  JobPostingCrawlerRegistryPort,
} from 'src/recruit/application/job-posting/ports/job-posting-crawler.port';
import type { JobPostingCrawlerSource } from 'src/recruit/application/job-posting/job-posting-crawler.types';
import { CatchJobCrawler } from 'src/recruit/infrastructure/job-posting/catch/catch-job.crawler';
import { JobdaJobCrawler } from 'src/recruit/infrastructure/job-posting/jobda/jobda-job.crawler';
import { JobkoreaJobCrawler } from 'src/recruit/infrastructure/job-posting/jobkorea/jobkorea-job.crawler';
import { JobplanetJobCrawler } from 'src/recruit/infrastructure/job-posting/jobplanet/jobplanet-job.crawler';
import { LinkareerJobCrawler } from 'src/recruit/infrastructure/job-posting/linkareer/linkareer-job.crawler';

/**
 * crawler 선택을 한 곳에 모읍니다.
 * application 서비스는 구체 crawler 대신 source 이름으로 이 registry를 조회합니다.
 */
@Injectable()
export class JobPostingCrawlerRegistry extends JobPostingCrawlerRegistryPort {
  private readonly crawlers: Map<
    JobPostingCrawlerSource,
    JobPostingCrawlerPort
  >;

  constructor(
    catchCrawler: CatchJobCrawler,
    jobdaCrawler: JobdaJobCrawler,
    jobkoreaCrawler: JobkoreaJobCrawler,
    jobplanetCrawler: JobplanetJobCrawler,
    linkareerCrawler: LinkareerJobCrawler,
  ) {
    super();
    this.crawlers = new Map(
      [
        catchCrawler,
        jobdaCrawler,
        jobkoreaCrawler,
        jobplanetCrawler,
        linkareerCrawler,
      ].map((crawler) => [crawler.source, crawler]),
    );
  }

  get(source: JobPostingCrawlerSource): JobPostingCrawlerPort {
    const crawler = this.crawlers.get(source);
    if (!crawler) {
      throw new Error(`지원하지 않는 채용공고 crawler입니다: ${source}`);
    }
    return crawler;
  }

  getAll(): JobPostingCrawlerPort[] {
    return [...this.crawlers.values()];
  }
}
