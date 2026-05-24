import { Injectable, Logger } from '@nestjs/common';
import { CompanyAnalysisService } from '../../../company-analysis/application/company-analysis.service';
import { CompanyAnalysisProgress, CompanyAnalysisDto } from '../../../company-analysis/domain/company-analysis.types';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

@Injectable()
export class CompanyAnalysisExecutorService {
  private readonly logger = new Logger(CompanyAnalysisExecutorService.name);

  constructor(private readonly companyAnalysisService: CompanyAnalysisService) {}

  async execute(
    companyName: string,
    model: string,
    onEvent: (event: CompanyAnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<CompanyAnalysisDto | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) return null;

      if (attempt > 0) {
        onEvent({ type: 'log', message: `오류 발생 — ${attempt}/${MAX_RETRIES}회 재시도 중... (${lastError?.message ?? '알 수 없는 오류'})` });
        await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
        if (signal?.aborted) return null;
      }

      try {
        let result: CompanyAnalysisDto | null = null;

        for await (const event of this.companyAnalysisService.analyzeStream(companyName, model)) {
          if (signal?.aborted) return null;
          onEvent(event);
          if (event.type === 'error') {
            throw new Error(event.message || '기업 분석 중 오류가 발생했습니다.');
          }
          if (event.type === 'done') result = event.result ?? null;
        }

        return result;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(`[${companyName}] 분석 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('기업 분석 중 오류가 발생했습니다.');
  }
}
