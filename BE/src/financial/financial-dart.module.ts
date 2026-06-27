import { Module, forwardRef } from '@nestjs/common';
import { SessionsModule } from 'src/sessions/sessions.module';
import { DartApiQueueService } from 'src/financial/infrastructure/dart-api-queue.service';
import { DartCorpCodeService } from 'src/financial/infrastructure/dart/dart-corp-code.service';
import { DartFinancialService } from 'src/financial/infrastructure/dart/dart-financial.service';
import { DartReportService } from 'src/financial/infrastructure/dart/dart-report.service';
import { FinancialInsightsService } from 'src/financial/application/financial-insights.service';
import { FinancialInsightsImplService } from 'src/financial/application/insights/financial-insights-impl.service';

@Module({
  imports: [forwardRef(() => SessionsModule)],
  providers: [
    DartApiQueueService,
    DartCorpCodeService,
    DartFinancialService,
    DartReportService,
    FinancialInsightsService,
    FinancialInsightsImplService,
  ],
  exports: [
    DartApiQueueService,
    DartCorpCodeService,
    DartFinancialService,
    DartReportService,
    FinancialInsightsService,
  ],
})
export class FinancialDartModule {}
