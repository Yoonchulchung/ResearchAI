import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from 'src/metrics/metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async scrape(@Res() res: Response) {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.end(await this.metrics.getMetrics());
  }
}
