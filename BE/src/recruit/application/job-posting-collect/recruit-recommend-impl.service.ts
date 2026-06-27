import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';
import { RecruitJobRecommendEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-recommend.entity';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { JobRecommendResult } from 'src/recruit/application/recruit-job-posting-collect.service';

@Injectable()
export class RecruitRecommendImplService {
  private readonly logger = new Logger(RecruitRecommendImplService.name);

  constructor(
    @InjectRepository(RecruitJobPostingEntity)
    private readonly repo: Repository<RecruitJobPostingEntity>,
    @InjectRepository(RecruitJobRecommendEntity)
    private readonly recommendRepo: Repository<RecruitJobRecommendEntity>,
    private readonly aiProvider: AiProviderService,
  ) {}

  async generateRecommendations(model: string): Promise<void> {
    const postings = await this.repo.find({
      order: { collectedAt: 'DESC' },
      take: 50,
    });
    const candidates = postings.filter((p) => p.detailContent);
    if (candidates.length === 0) return;

    this.logger.log(`[Recommend] ${candidates.length}개 공고 추천 분석 시작`);

    const BATCH = 10;
    const allResults: Array<{
      id: string;
      score: number;
      reason: string;
      match_points: string[];
    }> = [];

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const rows = batch.map((p) => ({
        id: p.id,
        title: p.title,
        company: p.company,
        jobs: p.jobs || '',
        detail: (p.detailContent || '').slice(0, 1200),
      }));

      const prompt = `아래 채용 공고를 IT/소프트웨어 개발 직군 취준생 관점에서 평가해줘.
평가 기준: ① 개발 직무 관련성 ② 성장/학습 기회 ③ 경험 쌓기 적합도
각 공고에 0~100점을 부여하고, 추천 이유(한 문장)와 핵심 포인트(2~3가지) 작성.

반드시 JSON만 출력:
{"items":[{"id":"공고id","score":85,"reason":"추천 이유","match_points":["포인트1","포인트2"]}]}

공고 목록:
${JSON.stringify(rows)}`;

      try {
        const { text } = await this.aiProvider.call(model, '', prompt, {
          caller: 'job-recommend',
        });
        const parsed = this.parseRecommendJson(text);
        allResults.push(...parsed);
      } catch (err) {
        this.logger.warn(`[Recommend] 배치 ${i / BATCH + 1} 오류: ${err}`);
      }
    }

    if (allResults.length === 0) return;

    const now = new Date().toISOString();
    const existing = await this.recommendRepo.find({
      select: ['jobPostingId'],
    });
    const existingIds = new Set(existing.map((e) => e.jobPostingId));

    const entities = allResults
      .filter((r) => !existingIds.has(r.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((r) =>
        this.recommendRepo.create({
          jobPostingId: r.id,
          score: r.score,
          reason: r.reason || null,
          matchPoints: r.match_points?.length
            ? JSON.stringify(r.match_points)
            : null,
          recommendedAt: now,
        }),
      );
    if (entities.length === 0) {
      this.logger.log('[Recommend] 새로운 추천 공고 없음 (기존 유지)');
      return;
    }
    await this.recommendRepo.save(entities);
    this.logger.log(
      `[Recommend] ${entities.length}개 추천 저장 완료 (기존 유지)`,
    );
  }

  async deleteRecommendation(id: number): Promise<void> {
    await this.recommendRepo.update(id, { isDeleted: true });
  }

  async getRecommendations(limit = 20): Promise<JobRecommendResult[]> {
    const recs = await this.recommendRepo.find({
      where: { isDeleted: false },
      order: { score: 'DESC' },
      take: limit,
    });
    if (recs.length === 0) return [];

    const ids = recs.map((r) => r.jobPostingId);
    const postings = await this.repo.findByIds(ids);
    const postingMap = new Map(postings.map((p) => [p.id, p]));

    return recs
      .map((rec) => {
        const p = postingMap.get(rec.jobPostingId);
        if (!p) return null;
        let matchPoints: string[] = [];
        try {
          matchPoints = JSON.parse(rec.matchPoints || '[]');
        } catch {
          /* ignore */
        }
        return {
          id: rec.id,
          jobPostingId: rec.jobPostingId,
          score: rec.score,
          reason: rec.reason,
          matchPoints,
          recommendedAt: rec.recommendedAt,
          title: p.title,
          company: p.company,
          companyType: p.companyType ?? null,
          type: p.type ?? null,
          location: p.location ?? null,
          startDate: p.startDate ?? null,
          endDate: p.endDate ?? null,
          deadline: p.deadline ?? null,
          jobs: p.jobs ?? null,
          source: p.source ?? null,
          appliedAt: p.appliedAt ?? null,
          url: p.url,
        };
      })
      .filter((r): r is JobRecommendResult => r !== null);
  }

  private parseRecommendJson(raw: string): Array<{
    id: string;
    score: number;
    reason: string;
    match_points: string[];
  }> {
    try {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const json = fenced?.[1]?.trim() ?? raw.trim();
      const parsed = JSON.parse(json);
      const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
      return items.filter(
        (i: unknown) => i && typeof (i as { id?: string }).id === 'string',
      );
    } catch {
      return [];
    }
  }
}
