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
import { JobPostingScraperService } from 'src/recruit/application/job-posting-scraper.service';
import { filterDuplicatePostingsByDeadlineAndTitle } from 'src/recruit/application/job-posting/job-posting-duplicate-filter';
import {
  AiProviderService,
  VlmMessage,
} from 'src/ai/infrastructure/ai-provider.service';
import { RecruitRecommendImplService } from 'src/recruit/application/job-posting-collect/recruit-recommend-impl.service';
import {
  CollectDetailConfig,
  CollectDetailStatus,
} from 'src/recruit/application/recruit-job-posting-collect.service';

const IMAGE_CACHE_DIR = path.join(process.cwd(), 'data/recruit/image-cache');
const DEFAULT_COLLECT_MODEL = 'gemini-2.0-flash';
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RecruitCollectImplService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecruitCollectImplService.name);
  private weeklyTimer: NodeJS.Timeout | null = null;
  currentConfig: Required<CollectDetailConfig> = {
    model: DEFAULT_COLLECT_MODEL,
    enableVlm: true,
    skipAiSteps: false,
    maxItems: 0,
    skipExisting: true,
    companyTypes: [],
    jobTypes: [],
    jobs: [],
  };
  status: CollectDetailStatus = {
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
    private readonly aiProvider: AiProviderService,
    private readonly jobScraperService: JobPostingScraperService,
    private readonly dataSource: DataSource,
    private readonly recommend: RecruitRecommendImplService,
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
      skipAiSteps: config?.skipAiSteps ?? false,
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

  async previewCount(config: CollectDetailConfig): Promise<{ total: number }> {
    const saved = this.currentConfig;
    this.currentConfig = {
      model: config.model || DEFAULT_COLLECT_MODEL,
      enableVlm: config.enableVlm ?? true,
      skipAiSteps: config.skipAiSteps ?? false,
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

  private async runCollect(): Promise<void> {
    try {
      let postings = await this.getFilteredPostings();
      if (this.currentConfig.maxItems > 0)
        postings = postings.slice(0, this.currentConfig.maxItems);
      this.status.total = postings.length;
      this.logger.log(
        `[DetailCollect] 모델=${this.currentConfig.model} VLM=${this.currentConfig.enableVlm} AI건너뛰기=${this.currentConfig.skipAiSteps} 스킵=${this.currentConfig.skipExisting} 공고 ${postings.length}개`,
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
      if (!this.currentConfig.skipAiSteps) {
        await this.recommend
          .generateRecommendations(this.currentConfig.model)
          .catch((err) =>
            this.logger.warn('[DetailCollect] 추천 생성 오류', err),
          );
      }
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

    const uniquePostings = filterDuplicatePostingsByDeadlineAndTitle(filtered);

    return uniquePostings.map((r) => ({
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

    let textContent = '';
    if (detail.detailHtml) {
      const $ = load(detail.detailHtml);
      $('script, style, noscript').remove();
      textContent = $.text().replace(/\s+/g, ' ').trim().slice(0, 8000);
    } else if (detail.detailContent) {
      textContent = detail.detailContent.slice(0, 8000);
    }

    let imageTexts = '';
    if (
      !this.currentConfig.skipAiSteps &&
      this.currentConfig.enableVlm &&
      detail.detailHtml
    ) {
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
}
