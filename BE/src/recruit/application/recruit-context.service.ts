import { Injectable } from '@nestjs/common';
import { JobRepository } from '../infrastructure/repository/job-repository';
import { SourceRegistry } from '../infrastructure/sources/source-registry';
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
   * 크롤러를 실시간으로 실행해 채용 공고를 수집하고 AI 컨텍스트 문자열로 반환.
   * 수집된 공고는 DB에도 저장(side effect).
   */
  async liveSearch(keyword: string, limitPerSource = 15): Promise<string> {
    const sources = this.registry.getAvailable();
    const jobs: { title: string; company: string; source: string; location?: string | null; skills: string[]; description?: string | null; url: string }[] = [];

    for (const source of sources) {
      let count = 0;
      try {
        for await (const job of source.collect({ keyword, limit: limitPerSource })) {
          this.jobRepository.upsert(job);
          jobs.push(job);
          if (++count >= limitPerSource) break;
        }
      } catch {
        // 실패 시 해당 소스 무시
      }
    }

    if (jobs.length === 0) return '';
    return this.format(keyword, jobs);
  }

  /**
   * 키워드로 DB에서 채용 공고를 조회하고 AI 컨텍스트 문자열로 반환.
   */
  search(keyword: string, limit = 20): string {
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
