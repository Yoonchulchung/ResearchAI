import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from 'src/queue/application/queue.service';
import { QueueWorkflowService } from 'src/queue/application/queue/queue-workflow.service';
import { QueueDispatcher } from 'src/queue/application/queue/queue.dispatcher';
import { ResearchHandler } from 'src/queue/application/queue/handlers/research.handler';
import { WriteAssistHandler } from 'src/queue/application/queue/handlers/write-assist.handler';
import { CompanyHandler } from 'src/queue/application/queue/handlers/company.handler';
import { DocumentHandler } from 'src/queue/application/queue/handlers/document.handler';
import { ContentHandler } from 'src/queue/application/queue/handlers/content.handler';
import { ResumeHandler } from 'src/queue/application/queue/handlers/resume.handler';
import { ImageHandler } from 'src/queue/application/queue/handlers/image.handler';
import { DeepResearchExecutor } from 'src/queue/application/job/deep-research.executor';
import { LightResearchExecutor } from 'src/queue/application/job/light-research.executor';
import { SummaryExecutor } from 'src/queue/application/job/summary.executor';
import { WriteAssistExecutor } from 'src/queue/application/job/write-assist/write-assist.executor';
import { CompanyProfileExecutor } from 'src/queue/application/job/company-profile.executor';
import { CompanyAnalysisExecutor } from 'src/queue/application/job/company-analysis.executor';
import { DocParseExecutor } from 'src/queue/application/job/doc-parse.executor';
import { SpecAnalysisExecutor } from 'src/queue/application/job/spec-analysis.executor';
import { TechBlogTrendExecutor } from 'src/queue/application/job/tech-blog-trend.executor';
import { PaperSummaryExecutor } from 'src/queue/application/job/paper-summary.executor';
import { PaperTrendExecutor } from 'src/queue/application/job/paper-trend.executor';
import { NewsArticleSummaryExecutor } from 'src/queue/application/job/news-article-summary.executor';
import { ResumeCoverLetterCategoryExecutor } from 'src/queue/application/job/resume-cover-letter-category.executor';
import { ResumeCoverLetterRefinedTitleExecutor } from 'src/queue/application/job/resume-cover-letter-refined-title.executor';
import { CompanyEnrichQueueService } from 'src/queue/application/company-enrich-queue.service';
import { QueueController } from 'src/queue/presentation/queue.controller';
import { ResearchModule } from 'src/research/research.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { AiModule } from 'src/ai/ai.module';
import { CompanyModule } from 'src/company/company.module';
import { FinancialDartModule } from 'src/financial/financial-dart.module';
import { CoverLetterModule } from 'src/recruit/cover-letter.module';
import { TechBlogModule } from 'src/news/tech-blog.module';
import { PapersModule } from 'src/news/papers.module';
import { NewsModule } from 'src/news/news.module';
import { ResumeModule } from 'src/recruit/resume.module';
import { QueueJobEntity } from 'src/queue/domain/entity/queue-job.entity';
import { CompanyEnrichQueueEntity } from 'src/company/domain/entity/company-enrich-queue.entity';
import { QueueJobRepository } from 'src/queue/domain/repository/queue-job.repository';
import { AppConfigModule } from 'src/config/config.module';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  imports: [
    forwardRef(() => ResearchModule),
    forwardRef(() => SessionsModule),
    forwardRef(() => AiModule),
    forwardRef(() => CompanyModule),
    FinancialDartModule,
    forwardRef(() => CoverLetterModule),
    forwardRef(() => TechBlogModule),
    forwardRef(() => PapersModule),
    forwardRef(() => NewsModule),
    forwardRef(() => ResumeModule),
    TypeOrmModule.forFeature([QueueJobEntity, CompanyEnrichQueueEntity]),
    AppConfigModule,
    SharedModule,
  ],
  controllers: [QueueController],
  providers: [
    // 핸들러 (카테고리별 SSE + 실행)
    ResearchHandler,
    WriteAssistHandler,
    CompanyHandler,
    DocumentHandler,
    ContentHandler,
    ResumeHandler,
    ImageHandler,
    // 디스패처 (핸들러 라우팅)
    QueueDispatcher,
    // 큐 서비스 (공개 API + 내부 워크플로우)
    QueueService,
    QueueWorkflowService,
    // 잡 실행자
    DeepResearchExecutor,
    LightResearchExecutor,
    SummaryExecutor,
    WriteAssistExecutor,
    CompanyProfileExecutor,
    CompanyAnalysisExecutor,
    DocParseExecutor,
    SpecAnalysisExecutor,
    TechBlogTrendExecutor,
    PaperSummaryExecutor,
    PaperTrendExecutor,
    NewsArticleSummaryExecutor,
    ResumeCoverLetterCategoryExecutor,
    ResumeCoverLetterRefinedTitleExecutor,
    // 기타
    CompanyEnrichQueueService,
    QueueJobRepository,
  ],
  exports: [QueueService, CompanyEnrichQueueService],
})
export class QueueModule {}
