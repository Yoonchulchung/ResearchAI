import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { MetricsService } from 'src/metrics/metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // /api/metrics 자기 자신은 추적 제외
    if (req.path === '/api/metrics' || req.path === '/metrics') {
      return next();
    }

    const startMs = Date.now();
    this.metrics.httpActiveRequests.inc();

    res.on('finish', () => {
      const duration = (Date.now() - startMs) / 1000;
      // UUID / 숫자 경로 파라미터 정규화 (/sessions/abc-123 → /sessions/:id)
      const route = req.path
        .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '/:id')
        .replace(/\/\d+/g, '/:id');

      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      this.metrics.httpRequestTotal.inc(labels);
      this.metrics.httpRequestDuration.observe(labels, duration);
      this.metrics.httpActiveRequests.dec();
    });

    next();
  }
}
