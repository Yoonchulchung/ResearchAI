import { Injectable, Logger, Optional } from '@nestjs/common';
import { SessionGateway } from '../../sessions/presentation/session.gateway';
import { CompanyService } from '../../company/application/company.service';

export type CompanyMissingRefreshPhase = 'idle' | 'running' | 'done' | 'stopped';

export interface CompanyMissingRefreshStatus {
  phase: CompanyMissingRefreshPhase;
  total: number;
  processed: number;
}

@Injectable()
export class CompanyMissingRefreshService {
  private readonly logger = new Logger(CompanyMissingRefreshService.name);
  private abortController: AbortController | null = null;
  private phase: CompanyMissingRefreshPhase = 'idle';
  private total = 0;
  private processed = 0;

  constructor(
    private readonly companyService: CompanyService,
    @Optional() private readonly gateway?: SessionGateway,
  ) {}

  getStatus(): CompanyMissingRefreshStatus {
    return { phase: this.phase, total: this.total, processed: this.processed };
  }

  // data-sources:update 채널에 현재 상태를 노출 (companies 페이지 큐 패널 표시용)
  private emitStatus(): void {
    this.gateway?.updateDataSourceStatus({
      name: 'company-refresh',
      pending: this.phase === 'running' ? this.total - this.processed : 0,
      running: this.phase === 'running' ? 1 : 0,
      cacheSize: this.processed,
    });
  }

  async start(): Promise<{ total: number }> {
    if (this.phase === 'running') return { total: this.total };

    const ids = await this.companyService.findMissingTypeCompanyIds();
    this.total = ids.length;
    this.processed = 0;

    if (ids.length === 0) {
      this.phase = 'done';
      this.emitStatus();
      return { total: 0 };
    }

    this.abortController = new AbortController();
    this.phase = 'running';
    this.emitStatus();

    this.run(ids, this.abortController.signal).catch(() => {});
    return { total: this.total };
  }

  stop(): void {
    this.abortController?.abort();
    this.phase = 'stopped';
    this.emitStatus();
  }

  private async run(ids: string[], signal: AbortSignal): Promise<void> {
    this.logger.log(`[CompanyMissingRefresh] 시작 — ${ids.length}개 기업`);
    try {
      for (const id of ids) {
        if (signal.aborted) break;
        try {
          await this.companyService.refreshMissing(id, { force: true });
        } catch (e) {
          this.logger.warn(`[CompanyMissingRefresh] 실패 — id=${id}: ${e}`);
        }
        this.processed++;
        this.emitStatus();
      }
    } finally {
      this.phase = signal.aborted ? 'stopped' : 'done';
      this.emitStatus();
      this.logger.log(`[CompanyMissingRefresh] 완료 — ${this.processed}/${this.total}개 처리`);
    }
  }
}
