import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { CompanyEnrichQueueEntity } from 'src/company/domain/entity/company-enrich-queue.entity';
import { CompanyEnrichService } from 'src/company/application/company-enrich.service';
import { SystemSettingsService } from 'src/shared/application/system-settings.service';

const MAX_ATTEMPTS = 3;
const PROCESS_INTERVAL_MS = 500;
const TIMING_WINDOW = 10; // 최근 N개 처리 시간으로 평균 계산

@Injectable()
export class CompanyEnrichQueueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CompanyEnrichQueueService.name);
  private isProcessing = false;
  private recentDurationsMs: number[] = [];
  private currentStartedAt: number | null = null;
  private sessionProcessed = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private recentCompanies: { name: string; doneAt: string }[] = [];

  constructor(
    @InjectRepository(CompanyEnrichQueueEntity)
    private readonly repo: Repository<CompanyEnrichQueueEntity>,
    private readonly companyService: CompanyEnrichService,
    private readonly systemSettings: SystemSettingsService,
    @Optional() private readonly gateway?: SessionGateway,
  ) {}

  async onApplicationBootstrap() {
    if (!this.gateway) {
      this.logger.warn(
        '[EnrichQueue] SessionGateway 미주입 — WebSocket 업데이트 비활성화',
      );
    } else {
      this.logger.log('[EnrichQueue] SessionGateway 주입 완료');
    }
    const pending = await this.repo.count();
    if (pending > 0) {
      this.logger.log(
        `[EnrichQueue] 서버 재시작 — 미처리 항목 ${pending}개 재개`,
      );
      this.scheduleNext(0);
    }
  }

  async enqueue(
    companyName: string,
    knownType?: string | null,
    knownEmployees?: string | null,
  ): Promise<void> {
    const normalizedName = this.normalize(companyName);
    if (!normalizedName) return;

    await this.repo.upsert(
      {
        normalizedName,
        companyName,
        knownType: knownType ?? null,
        knownEmployees: knownEmployees ?? null,
      },
      { conflictPaths: ['normalizedName'], skipUpdateIfNoValuesChanged: true },
    );

    this.scheduleNext(0);
  }

  private scheduleNext(delayMs: number): void {
    if (this.isProcessing) return;
    setTimeout(() => this.processNext(), delayMs);
  }

  private avgDurationMs(): number | null {
    if (this.recentDurationsMs.length === 0) return null;
    return (
      this.recentDurationsMs.reduce((a, b) => a + b, 0) /
      this.recentDurationsMs.length
    );
  }

  private async emitStatus(
    currentCompany: string | null = null,
  ): Promise<void> {
    const pending = await this.repo.count();
    const avg = this.avgDurationMs();
    let estimatedMs: number | null = null;
    if (avg !== null) {
      const elapsedMs = this.currentStartedAt
        ? Date.now() - this.currentStartedAt
        : 0;
      const remainingForCurrent = this.isProcessing
        ? Math.max(0, avg - elapsedMs)
        : 0;
      estimatedMs = remainingForCurrent + pending * avg;
    }
    // total = 완료 + 남은 대기 + 현재 처리 중 1건
    const sessionTotal =
      this.sessionProcessed + pending + (this.isProcessing ? 1 : 0);
    this.gateway?.emitEnrichQueueUpdate({
      pending,
      processing: this.isProcessing,
      currentCompany,
      estimatedMs,
      sessionProcessed: this.sessionProcessed,
      sessionTotal,
      recentCompanies: this.recentCompanies,
      apiStats: this.companyService.getStats(),
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const enabled = await this.systemSettings.isCompanyCollectEnabled();
    if (!enabled) {
      this.logger.log('[EnrichQueue] 수집 비활성화 상태 — 처리 건너뜀');
      await this.emitStatus(null);
      return;
    }

    const item = await this.repo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (!item) {
      await this.emitStatus(null);
      return;
    }

    // 재시도 한도 초과 항목 제거
    if (item.attempts >= MAX_ATTEMPTS) {
      this.logger.warn(
        `[EnrichQueue] 최대 재시도 초과 — "${item.companyName}" (${item.attempts}회) 제거`,
      );
      await this.repo.delete({ normalizedName: item.normalizedName });
      this.scheduleNext(0);
      return;
    }

    this.isProcessing = true;
    this.currentStartedAt = Date.now();
    this.logger.log(
      `[EnrichQueue] 처리 시작 — "${item.companyName}" (시도 ${item.attempts + 1}/${MAX_ATTEMPTS})`,
    );
    await this.emitStatus(item.companyName);

    try {
      await this.companyService.findOrCreate(
        item.companyName,
        item.knownType,
        item.knownEmployees,
      );
      await this.repo.delete({ normalizedName: item.normalizedName });
      this.sessionProcessed++;
      this.recentCompanies.unshift({
        name: item.companyName,
        doneAt: new Date().toISOString(),
      });
      if (this.recentCompanies.length > 20) this.recentCompanies.pop();
      const duration = Date.now() - this.currentStartedAt;
      this.recentDurationsMs.push(duration);
      if (this.recentDurationsMs.length > TIMING_WINDOW)
        this.recentDurationsMs.shift();
      this.logger.log(
        `[EnrichQueue] 완료 — "${item.companyName}" (${(duration / 1000).toFixed(1)}s)`,
      );
    } catch (e) {
      const attempts = item.attempts + 1;
      this.logger.warn(
        `[EnrichQueue] 실패 — "${item.companyName}": ${(e as Error).message} (${attempts}/${MAX_ATTEMPTS}회)`,
      );
      await this.repo.update(
        { normalizedName: item.normalizedName },
        { attempts, lastAttemptedAt: new Date() },
      );
    } finally {
      this.isProcessing = false;
      this.currentStartedAt = null;
    }

    // 다음 항목 처리
    const remaining = await this.repo.count();
    await this.emitStatus(null);
    if (remaining > 0) {
      this.scheduleNext(PROCESS_INTERVAL_MS);
    } else {
      // 큐가 비면 30초 후 세션 카운터 리셋
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        this.sessionProcessed = 0;
        this.recentCompanies = [];
        this.companyService.resetStats();
        this.resetTimer = null;
      }, 30_000);
    }
  }

  async getQueueStatus(): Promise<{
    pending: number;
    nextCompany: string | null;
  }> {
    const pending = await this.repo.count();
    const next = await this.repo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    return { pending, nextCompany: next?.companyName ?? null };
  }

  private normalize(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }
}
