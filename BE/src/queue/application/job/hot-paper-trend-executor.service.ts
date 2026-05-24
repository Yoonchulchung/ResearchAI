import { Injectable, Logger } from '@nestjs/common';
import { HotPapersService } from '../../../news/hot-papers/application/hot-papers.service';
import type { HotPaperTrendSummary } from '../../../news/hot-papers/application/hot-papers.service';

export interface HotPaperTrendRequest {
  model?: string;
  refresh?: boolean;
}

@Injectable()
export class HotPaperTrendExecutorService {
  private readonly logger = new Logger(HotPaperTrendExecutorService.name);

  constructor(private readonly hotPapersService: HotPapersService) {}

  async execute(
    request: HotPaperTrendRequest,
    onChunk: (chunk: string) => void,
  ): Promise<HotPaperTrendSummary> {
    this.logger.log(`[HotPaperTrend] 분석 시작 model=${request.model ?? 'default'}`);
    const result = await this.hotPapersService.getTrendSummary({ ...request, onChunk });
    this.logger.log(`[HotPaperTrend] 완료 paperCount=${result.paperCount}`);
    return result;
  }
}
