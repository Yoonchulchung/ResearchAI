import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { MetricsService } from 'src/metrics/metrics.service';
import { MetricsController } from 'src/metrics/metrics.controller';
import { HttpMetricsMiddleware } from 'src/metrics/http-metrics.middleware';

@Module({
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*path');
  }
}
