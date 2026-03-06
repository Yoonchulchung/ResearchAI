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

  // *********** //
  // 채용 공고 검색 //
  // *********** //
  async *liveSearch(
    query: CollectQuery,
    limitPerSource = 15,
  ): AsyncGenerator<
    | { type: 'log'; message: string }
    | { type: 'jobs'; jobs: { title: string; company: string; location?: string | null; description?: string | null; skills: string[]; url: string }[] }
    | { type: 'result'; result: string }
  > {
    const sources = this.registry.getAvailable();
    const jobs: { title: string; company: string; source: string; location?: string | null; skills: string[]; description?: string | null; url: string }[] = [];

    const filterDesc = [
      query.companyTypes?.length ? `기업유형: ${query.companyTypes.join(', ')}` : '',
      query.jobTypes?.length ? `경력: ${query.jobTypes.join(', ')}` : '',
    ].filter(Boolean).join(' / ');
    yield { type: 'log', message: `사용 가능한 소스: ${sources.length > 0 ? sources.map(s => s.name).join(', ') : '없음'}${filterDesc ? ` / ${filterDesc}` : ''}` };


    // 데이터 수집 진행
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

    if (jobs.length > 0) {
      yield {
        type: 'jobs',
        jobs: jobs.map(({ title, company, location, description, skills, url }) => ({ title, company, location, description, skills, url })),
      };
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

  private cleanSkills(skills: string[]): string[] {
    return skills
      .map((s) => s.trim())
      .filter(
        (s) =>
          s.length > 0 &&
          !/^수정일/.test(s) &&                       // "수정일 26/03/05" 제거
          !/^\d{2,4}[./]\d{2}[./]\d{2}$/.test(s) &&  // 날짜 패턴 제거
          !/^\d+$/.test(s),                            // 숫자만 있는 항목 제거
      );
  }

  private cleanLocation(location?: string | null): string {
    return (location ?? '').replace(/\s+/g, ' ').trim();
  }

  private format(keyword: string, jobs: { title: string; company: string; source: string; location?: string | null; skills: string[]; description?: string | null; url: string }[]): string {
    const lines = jobs.map((job, i) => {
      const location = this.cleanLocation(job.location);
      const skills = this.cleanSkills(job.skills);
      const meta = [location, job.description].filter(Boolean).join(' / ');
      const skillStr = skills.length > 0 ? ` [${skills.join(', ')}]` : '';
      return `${i + 1}. ${job.title} — ${job.company}${meta ? ` (${meta})` : ''}${skillStr}`;
    });

    return `## 채용 공고 (${jobs.length}건 / 키워드: "${keyword}")\n\n${lines.join('\n')}`;
  }
}
