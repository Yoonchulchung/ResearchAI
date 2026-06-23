import { Injectable, Logger } from '@nestjs/common';
import { CoverLetterScraperService } from 'src/recruit/application/cover-letter/cover-letter-scraper.service';
import type { CoverLetterJobAnalysisRequest } from 'src/recruit/domain/cover-letter/cover-letter.model';

@Injectable()
export class SpecAnalysisExecutor {
  private readonly logger = new Logger(SpecAnalysisExecutor.name);

  constructor(private readonly coverLetterService: CoverLetterScraperService) {}

  async execute(
    request: CoverLetterJobAnalysisRequest,
    onLog: (message: string) => void,
  ) {
    const count = request.ids?.length ?? request.limit ?? 20;
    this.logger.log(`[SpecAnalysis] ${count}건 분석 시작`);
    onLog(`${count}건 분석 중...`);

    const result = await this.coverLetterService.analyzeJobsWithAi(request);

    this.logger.log(`[SpecAnalysis] 완료 — ${result.items.length}건`);
    return result;
  }
}
