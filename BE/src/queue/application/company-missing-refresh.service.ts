import { Injectable, Logger, Optional } from '@nestjs/common';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { CompanyService } from 'src/company/application/company.service';
import { CompanyInfoService } from 'src/company/application/company-info.service';

export type CompanyMissingRefreshPhase =
  | 'idle'
  | 'running'
  | 'done'
  | 'stopped';

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
  private currentCompanyName: string | null = null;
  private recentCompanies: { name: string; doneAt: string }[] = [];

  constructor(
    private readonly companyService: CompanyService,
    private readonly companyEnrich: CompanyInfoService,
    @Optional() private readonly gateway?: SessionGateway,
  ) {}

  getStatus(): CompanyMissingRefreshStatus {
    return { phase: this.phase, total: this.total, processed: this.processed };
  }

  private emitStatus(): void {
    const pending = Math.max(0, this.total - this.processed);
    const processing = this.phase === 'running';
    this.gateway?.emitEnrichQueueUpdate({
      pending,
      processing,
      currentCompany: processing ? this.currentCompanyName : null,
      estimatedMs: null,
      sessionProcessed: this.processed,
      sessionTotal: this.total,
      recentCompanies: this.recentCompanies,
      apiStats: this.companyEnrich.getStats(),
    });
  }

  async start(): Promise<{ total: number }> {
    if (this.phase === 'running') return { total: this.total };

    const companies = await this.companyService.findMissingTypeCompanies();
    this.total = companies.length;
    this.processed = 0;
    this.recentCompanies = [];
    this.companyEnrich.resetStats();

    if (companies.length === 0) {
      this.phase = 'done';
      this.emitStatus();
      return { total: 0 };
    }

    this.abortController = new AbortController();
    this.phase = 'running';
    this.emitStatus();

    this.run(companies, this.abortController.signal).catch(() => {});
    return { total: this.total };
  }

  stop(): void {
    this.abortController?.abort();
    this.phase = 'stopped';
    this.currentCompanyName = null;
    this.emitStatus();
  }

  private async run(
    companies: { id: string; name: string }[],
    signal: AbortSignal,
  ): Promise<void> {
    this.logger.log(
      `[CompanyMissingRefresh] 시작 — ${companies.length}개 기업`,
    );
    try {
      for (const { id, name } of companies) {
        if (signal.aborted) break;
        this.currentCompanyName = name;
        this.emitStatus();
        try {
          await this.companyEnrich.refreshMissing(id, { force: true });
          this.recentCompanies.unshift({
            name,
            doneAt: new Date().toISOString(),
          });
          if (this.recentCompanies.length > 20) this.recentCompanies.pop();
        } catch (e) {
          this.logger.warn(`[CompanyMissingRefresh] 실패 — id=${id}: ${e}`);
        }
        this.processed++;
        this.emitStatus();
      }
    } finally {
      this.phase = signal.aborted ? 'stopped' : 'done';
      this.currentCompanyName = null;
      this.emitStatus();
      this.logger.log(
        `[CompanyMissingRefresh] 완료 — ${this.processed}/${this.total}개 처리`,
      );
    }
  }
}
