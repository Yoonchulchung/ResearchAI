import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { load } from 'cheerio';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';
import { RecruitJobRecommendEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-recommend.entity';
import { JobPostingScraperService } from 'src/recruit/application/job-posting-scraper.service';
import { deduplicatePostingsByDeadlineAndTitle } from 'src/recruit/application/job-posting/job-posting-dedup.utils';
import {
  AiProviderService,
  VlmMessage,
} from 'src/ai/infrastructure/ai-provider.service';

export interface JobRecommendResult {
  id: number;
  jobPostingId: string;
  score: number;
  reason: string | null;
  matchPoints: string[];
  recommendedAt: string;
  title: string;
  company: string;
  companyType: string | null;
  type: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  deadline: string | null;
  jobs: string | null;
  source: string | null;
  appliedAt: string | null;
  url: string;
}

const IMAGE_CACHE_DIR = path.join(process.cwd(), 'data/recruit/image-cache');
const DEFAULT_COLLECT_MODEL = 'gemini-2.0-flash';
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

export interface CollectDetailConfig {
  model?: string;
  enableVlm?: boolean;
  maxItems?: number;
  skipExisting?: boolean;
  companyTypes?: string[];
  jobTypes?: string[];
  jobs?: string[];
}

export interface CollectDetailStatus {
  running: boolean;
  total: number;
  processed: number;
  startedAt: string | null;
  lastActivity: string | null;
  lastRunAt: string | null;
  model: string;
  enableVlm: boolean;
}

@Injectable()
export class RecruitJobPostingCollectService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RecruitJobPostingCollectService.name);
  private weeklyTimer: NodeJS.Timeout | null = null;
  private currentConfig: Required<CollectDetailConfig> = {
    model: DEFAULT_COLLECT_MODEL,
    enableVlm: true,
    maxItems: 0,
    skipExisting: true,
    companyTypes: [],
    jobTypes: [],
    jobs: [],
  };
  private status: CollectDetailStatus = {
    running: false,
    total: 0,
    processed: 0,
    startedAt: null,
    lastActivity: null,
    lastRunAt: null,
    model: DEFAULT_COLLECT_MODEL,
    enableVlm: true,
  };

  constructor(
    @InjectRepository(RecruitJobPostingEntity)
    private readonly repo: Repository<RecruitJobPostingEntity>,
    @InjectRepository(RecruitJobRecommendEntity)
    private readonly recommendRepo: Repository<RecruitJobRecommendEntity>,
    private readonly aiProvider: AiProviderService,
    private readonly jobScraperService: JobPostingScraperService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.weeklyTimer = setInterval(() => {
      void this.collect().catch((err) =>
        this.logger.error('주간 자동 수집 오류', err),
      );
    }, WEEKLY_MS);
  }

  onModuleDestroy() {
    if (this.weeklyTimer) clearInterval(this.weeklyTimer);
  }

  getStatus(): CollectDetailStatus {
    return { ...this.status };
  }

  stop(): { message: string } {
    if (!this.status.running) return { message: '실행 중인 작업이 없습니다.' };
    this.status.running = false;
    return { message: '수집 중단 요청됨.' };
  }

  async collect(config?: CollectDetailConfig): Promise<{ message: string }> {
    if (this.status.running) return { message: '이미 수집 중입니다.' };
    this.currentConfig = {
      model: config?.model || DEFAULT_COLLECT_MODEL,
      enableVlm: config?.enableVlm ?? true,
      maxItems: config?.maxItems ?? 0,
      skipExisting: config?.skipExisting ?? true,
      companyTypes: config?.companyTypes ?? [],
      jobTypes: config?.jobTypes ?? [],
      jobs: config?.jobs ?? [],
    };
    this.status = {
      running: true,
      total: 0,
      processed: 0,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      lastRunAt: null,
      model: this.currentConfig.model,
      enableVlm: this.currentConfig.enableVlm,
    };
    void this.runCollect().catch((err) => {
      this.logger.error('수집 오류', err);
      this.status.running = false;
    });
    return { message: '채용 상세 수집을 시작했습니다.' };
  }

  async listCollected(limit = 100): Promise<RecruitJobPostingEntity[]> {
    return this.repo.find({ order: { collectedAt: 'DESC' }, take: limit });
  }

  private async runCollect(): Promise<void> {
    try {
      let postings = await this.getFilteredPostings();
      if (this.currentConfig.maxItems > 0)
        postings = postings.slice(0, this.currentConfig.maxItems);
      this.status.total = postings.length;
      this.logger.log(
        `[DetailCollect] 모델=${this.currentConfig.model} VLM=${this.currentConfig.enableVlm} 스킵=${this.currentConfig.skipExisting} 공고 ${postings.length}개`,
      );

      for (const posting of postings) {
        if (!this.status.running) break;
        this.status.lastActivity = new Date().toISOString();

        if (this.currentConfig.skipExisting) {
          const existing = await this.repo.findOne({
            where: { id: posting.id },
          });
          if (existing?.detailContent) {
            this.status.processed++;
            continue;
          }
        }

        try {
          await this.processPosting(posting);
        } catch (err) {
          this.logger.warn(`[DetailCollect] ${posting.id} 처리 오류: ${err}`);
        }
        this.status.processed++;
      }
      this.status.lastRunAt = new Date().toISOString();
      this.logger.log(
        `[DetailCollect] 완료 ${this.status.processed}/${this.status.total}`,
      );
      // 수집 완료 후 AI 추천 생성
      await this.generateRecommendations().catch((err) =>
        this.logger.warn('[DetailCollect] 추천 생성 오류', err),
      );
    } finally {
      this.status.running = false;
    }
  }

  private async getFilteredPostings(): Promise<
    Array<{
      id: string;
      title: string;
      company: string;
      url: string;
      deadline: string | null;
      end_date: string | null;
      type: string | null;
      company_type: string | null;
    }>
  > {
    const rows = await this.repo.find({
      select: [
        'id',
        'title',
        'company',
        'url',
        'deadline',
        'endDate',
        'type',
        'companyType',
        'jobs',
        'collectedAt',
      ],
    });

    const now = Date.now();
    const { companyTypes, jobTypes, jobs } = this.currentConfig;

    // recruit_job_posting.company_type은 null일 수 있으므로 companies 테이블에서 fallback 조회
    let companyTypeMap = new Map<string, string>();
    if (companyTypes.length > 0) {
      const normalize = (n: string) =>
        n
          .replace(/[\s(주)㈜()（）㈔주식회사유한회사합자회사]/g, '')
          .toLowerCase();
      const companyRows = await this.dataSource.query(
        `SELECT normalized_name, company_type FROM companies WHERE company_type IS NOT NULL`,
      );
      companyTypeMap = new Map(
        companyRows.map((c) => [c.normalized_name, c.company_type]),
      );

      for (const r of rows) {
        if (r.companyType)
          companyTypeMap.set(normalize(r.company), r.companyType);
      }
    }
    const normalize = (n: string) =>
      n
        .replace(/[\s(주)㈜()（）㈔주식회사유한회사합자회사]/g, '')
        .toLowerCase();

    const filtered = rows.filter((r) => {
      const raw = r.endDate || r.deadline;
      if (raw) {
        const ts = this.parseDate(raw);
        if (ts !== null && ts < now) return false;
      }
      if (companyTypes.length > 0) {
        const resolved =
          r.companyType ?? companyTypeMap.get(normalize(r.company)) ?? '';
        if (!companyTypes.includes(resolved)) return false;
      }
      if (jobTypes.length > 0 && !jobTypes.includes(r.type ?? '')) return false;
      if (jobs.length > 0) {
        const p = { title: r.title, jobs: r.jobs };
        if (
          !jobs.some((cat) =>
            this.jobScraperService.matchesCategoryFilter(p, cat),
          )
        )
          return false;
      }
      return true;
    });

    const deduped = deduplicatePostingsByDeadlineAndTitle(filtered);

    return deduped.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      url: r.url,
      deadline: r.deadline,
      end_date: r.endDate,
      type: r.type,
      company_type: r.companyType,
    }));
  }

  async previewCount(config: CollectDetailConfig): Promise<{ total: number }> {
    const saved = this.currentConfig;
    this.currentConfig = {
      model: config.model || DEFAULT_COLLECT_MODEL,
      enableVlm: config.enableVlm ?? true,
      maxItems: config.maxItems ?? 0,
      skipExisting: config.skipExisting ?? true,
      companyTypes: config.companyTypes ?? [],
      jobTypes: config.jobTypes ?? [],
      jobs: config.jobs ?? [],
    };
    const postings = await this.getFilteredPostings();
    this.currentConfig = saved;

    let total = postings.length;
    if (config.maxItems && config.maxItems > 0)
      total = Math.min(total, config.maxItems);

    if (config.skipExisting ?? true) {
      const ids = postings.map((p) => p.id).slice(0, total);
      const existing = await this.repo.find({ where: { id: In(ids) } });
      const skippable = new Set(
        existing.filter((e) => e.detailContent).map((e) => e.id),
      );
      total = ids.filter((id) => !skippable.has(id)).length;
    }
    return { total };
  }

  private async processPosting(posting: {
    id: string;
    title: string;
    company: string;
    url: string;
    deadline: string | null;
    end_date: string | null;
  }): Promise<void> {
    const linkareerUrl = `https://linkareer.com/activity/${posting.id}`;
    const detail = await this.jobScraperService.fetchDetailContent(
      posting.id,
      linkareerUrl,
      'linkareer',
    );

    // HTML → plain text
    let textContent = '';
    if (detail.detailHtml) {
      const $ = load(detail.detailHtml);
      $('script, style, noscript').remove();
      textContent = $.text().replace(/\s+/g, ' ').trim().slice(0, 8000);
    } else if (detail.detailContent) {
      textContent = detail.detailContent.slice(0, 8000);
    }

    // VLM: extract text from cached images
    let imageTexts = '';
    if (this.currentConfig.enableVlm && detail.detailHtml) {
      const imageFiles = this.jobScraperService.getPostingImageFiles(
        detail.detailHtml,
      );
      for (const filename of imageFiles.slice(0, 5)) {
        const imgText = await this.extractImageTextVlm(filename).catch(
          () => '',
        );
        if (imgText) imageTexts += `\n[이미지]\n${imgText}`;
      }
    }

    const detailContent =
      [textContent, imageTexts].filter(Boolean).join('\n\n').trim() || null;

    await this.repo.save({
      id: posting.id,
      title: posting.title,
      company: posting.company,
      companyType: detail.companyType ?? null,
      jobs: detail.jobs ?? null,
      detailContent,
      url: linkareerUrl,
      deadline: posting.end_date || posting.deadline || null,
      collectedAt: new Date().toISOString(),
    });
  }

  private async extractImageTextVlm(filename: string): Promise<string> {
    const filePath = path.join(IMAGE_CACHE_DIR, path.basename(filename));
    if (!fs.existsSync(filePath)) return '';

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mediaTypeMap: Record<
      string,
      'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    > = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const mediaType = mediaTypeMap[ext] ?? 'image/png';

    const messages: VlmMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image', mediaType, data: buffer.toString('base64') },
          '이 이미지에서 텍스트를 모두 추출해줘. 텍스트만 반환하고 설명은 필요 없어.',
        ],
      },
    ];

    let text = '';
    for await (const chunk of this.aiProvider.stream(
      this.currentConfig.model,
      '',
      messages,
    )) {
      text += chunk;
    }
    return text.trim();
  }

  private parseDate(raw: string): number | null {
    const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso)
      return new Date(
        Number(iso[1]),
        Number(iso[2]) - 1,
        Number(iso[3]),
      ).getTime();
    const full = raw.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
    if (full)
      return new Date(
        Number(full[1]),
        Number(full[2]) - 1,
        Number(full[3]),
      ).getTime();
    const md = raw.match(/(\d{1,2})[./](\d{1,2})/);
    if (md) {
      const today = new Date();
      const d = new Date(today.getFullYear(), Number(md[1]) - 1, Number(md[2]));
      const todayMs = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime();
      if (d.getTime() >= todayMs) return d.getTime();
      return new Date(
        today.getFullYear() + 1,
        Number(md[1]) - 1,
        Number(md[2]),
      ).getTime();
    }
    return null;
  }

  // ── AI 추천 생성 ────────────────────────────────────────────────────────────

  async generateRecommendations(): Promise<void> {
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
        const { text } = await this.aiProvider.call(
          this.currentConfig.model,
          '',
          prompt,
          { caller: 'job-recommend' },
        );
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
