import { Injectable, Logger } from '@nestjs/common';
import { PapersService } from 'src/news/application/papers/papers.service';
import type { PaperTrendSummary } from 'src/news/application/papers/papers.service';

export interface PaperTrendRequest {
  model?: string;
  refresh?: boolean;
}

@Injectable()
export class PaperTrendExecutor {
  private readonly logger = new Logger(PaperTrendExecutor.name);

  constructor(private readonly papersService: PapersService) {}

  async execute(
    request: PaperTrendRequest,
    onChunk: (chunk: string) => void,
  ): Promise<PaperTrendSummary> {
    this.logger.log(
      `[PaperTrend] 분석 시작 model=${request.model ?? 'default'}`,
    );
    const result = await this.papersService.getTrendSummary({
      ...request,
      onChunk,
    });
    this.logger.log(`[PaperTrend] 완료 paperCount=${result.paperCount}`);
    return result;
  }
}
