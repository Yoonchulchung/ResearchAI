import { Injectable } from '@nestjs/common';
import { CollectQuery } from 'src/recruit/domain/job-source.interface';
import { RecruitContextImplService } from 'src/recruit/application/context/recruit-context-impl.service';

@Injectable()
export class RecruitContextService {
  constructor(private readonly impl: RecruitContextImplService) {}

  hasData(): boolean {
    return this.impl.hasData();
  }

  liveSearch(
    query: CollectQuery,
    limitPerSource = 15,
  ): AsyncGenerator<
    | { type: 'log'; message: string }
    | {
        type: 'jobs';
        jobs: {
          title: string;
          company: string;
          location?: string | null;
          description?: string | null;
          skills: string[];
          url: string;
        }[];
      }
    | { type: 'result'; result: string }
  > {
    return this.impl.liveSearch(query, limitPerSource);
  }

  dbSearch(keyword: string, limit = 20): string {
    return this.impl.dbSearch(keyword, limit);
  }
}
