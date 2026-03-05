import { Injectable } from '@nestjs/common';
import { JobRepository } from '../infrastructure/repository/job-repository';
import { SourceRegistry } from '../infrastructure/sources/source-registry';
import { CollectQuery } from '../domain/job-source.interface';
@Injectable()
export class RecruitContextService {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly registry: SourceRegistry,
  ) {}

  hasData(): boolean {
    return this.jobRepository.stats().total > 0;
  }

  /**
   * 크롤러를 실시간으로 실행해 채용 공고를 수집.
   * log 이벤트를 실시간으로 yield하고, 마지막에 result 이벤트를 yield.
   */
  async *liveSearch(
    query: CollectQuery,
    limitPerSource = 15,
  ): AsyncGenerator<{ type: 'log'; message: string } | { type: 'result'; result: string }> {
    const sources = this.registry.getAvailable();
    const jobs: { title: string; company: string; source: string; location?: string | null; skills: string[]; description?: string | null; url: string }[] = [];

    const filterDesc = query.companyType ? ` / 기업유형: ${query.companyType}` : '';
    yield { type: 'log', message: `사용 가능한 소스: ${sources.length > 0 ? sources.map(s => s.name).join(', ') : '없음'}${filterDesc}` };

    for (const source of sources) {
      let count = 0;
      yield { type: 'log', message: `[${source.name}]에서 수집 중...` };

      try {
        await Promise.race([
          (async () => {
            for await (const job of source.collect({ ...query, limit: limitPerSource })) {
              this.jobRepository.upsert(job);
              jobs.push(job);
              if (++count >= limitPerSource) break;
            }
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('시간 초과 (15s)')), 15_000),
          ),
        ]);
        yield { type: 'log', message: `[${source.name}] ${count}개 수집` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        yield { type: 'log', message: `[${source.name}] 오류 — ${msg}` };
      }
    }

    yield { type: 'log', message: `총 수집: ${jobs.length}개` };
    for (const job of jobs) {
      yield { type: 'log', message: `  • ${job.title} — ${job.company}` };
    }

    yield { type: 'result', result: jobs.length > 0 ? this.format(query.keyword, jobs) : '' };
  }

  /**
   * 키워드로 DB에서 채용 공고를 조회하고 AI 컨텍스트 문자열로 반환.
   */
  dbSearch(keyword: string, limit = 20): string {
    const jobs = this.jobRepository.findAll({ keyword }).slice(0, limit);
    if (jobs.length === 0) return '';
    return this.format(keyword, jobs);
  }

  private format(keyword: string, jobs: { title: string; company: string; source: string; location?: string | null; skills: string[]; description?: string | null; url: string }[]): string {
    const body = jobs
      .map((job, i) => {
        const lines = [
          `### ${i + 1}. ${job.title} — ${job.company}`,
          `- 소스: ${job.source}`,
          job.location ? `- 위치: ${job.location}` : null,
          job.skills.length > 0 ? `- 요구 스킬: ${job.skills.join(', ')}` : null,
          job.description ? `- 설명: ${job.description}` : null,
          `- URL: ${job.url}`,
        ];
        return lines.filter(Boolean).join('\n');
      })
      .join('\n\n');

    return `## 채용 공고 검색 결과 (${jobs.length}건 / 키워드: "${keyword}")\n\n${body}`;
  }
}
