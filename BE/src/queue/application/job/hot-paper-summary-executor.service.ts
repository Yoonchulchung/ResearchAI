import { Injectable, Logger } from '@nestjs/common';
import { HotPapersService } from '../../../news/hot-papers/application/hot-papers.service';

export interface HotPaperSummaryRequest {
  id: string;
  model?: string;
  refresh?: boolean;
}

export interface HotPaperSummaryResult {
  id: string;
  aiSummary: string;
  aiSummaryModel: string;
  aiSummaryAt: string;
  cached: boolean;
}

@Injectable()
export class HotPaperSummaryExecutorService {
  private readonly logger = new Logger(HotPaperSummaryExecutorService.name);

  constructor(private readonly hotPapersService: HotPapersService) {}

  async execute(request: HotPaperSummaryRequest): Promise<HotPaperSummaryResult> {
    this.logger.log(`[HotPaperSummary] 요약 시작 id=${request.id}`);
    const result = await this.hotPapersService.summarizePaper(request.id, {
      model: request.model,
      refresh: request.refresh,
    });
    this.logger.log(`[HotPaperSummary] 완료 id=${request.id}`);
    return result;
  }
}
