import { Injectable, Logger } from '@nestjs/common';
import { PapersService } from 'src/news/application/papers/papers.service';

export interface PaperSummaryRequest {
  id: string;
  model?: string;
  refresh?: boolean;
}

export interface PaperSummaryResult {
  id: string;
  aiSummary: string;
  aiSummaryModel: string;
  aiSummaryAt: string;
  cached: boolean;
}

@Injectable()
export class PaperSummaryExecutor {
  private readonly logger = new Logger(PaperSummaryExecutor.name);

  constructor(private readonly papersService: PapersService) {}

  async execute(request: PaperSummaryRequest): Promise<PaperSummaryResult> {
    this.logger.log(`[PaperSummary] 요약 시작 id=${request.id}`);
    const result = await this.papersService.summarizePaper(request.id, {
      model: request.model,
      refresh: request.refresh,
    });
    this.logger.log(`[PaperSummary] 완료 id=${request.id}`);
    return result;
  }
}
