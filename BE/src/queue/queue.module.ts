import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiQueueService } from 'src/queue/application/queue/ai-queue.service';
import { AiJobDispatcher } from 'src/queue/application/queue/ai-job-dispatcher.service';
import { DeepResearchExecutorService } from 'src/queue/application/job/deep-research-executor.service';
import { LightResearchExecutorService } from 'src/queue/application/job/light-research-executor.service';
import { SummaryExecutorService } from 'src/queue/application/job/summary-executor.service';
import { WriteAssistExecutorService } from 'src/queue/application/job/write-assist/write-assist-executor.service';
import { CompanyProfileExecutorService } from 'src/queue/application/job/company-profile-executor.service';
import { CompanyAnalysisExecutorService } from 'src/queue/application/job/company-analysis-executor.service';
import { DocParseExecutorService } from 'src/queue/application/job/doc-parse-executor.service';
import { SpecAnalysisExecutorService } from 'src/queue/application/job/spec-analysis-executor.service';
import { TechBlogTrendExecutorService } from 'src/queue/application/job/tech-blog-trend-executor.service';
import { PaperSummaryExecutorService } from 'src/queue/application/job/paper-summary-executor.service';
import { PaperTrendExecutorService } from 'src/queue/application/job/paper-trend-executor.service';
import { NewsArticleSummaryExecutorService } from 'src/queue/application/job/news-article-summary-executor.service';
import { ResumeCoverLetterCategoryExecutorService } from 'src/queue/application/job/resume-cover-letter-category-executor.service';
import { ResumeCoverLetterRefinedTitleExecutorService } from 'src/queue/application/job/resume-cover-letter-refined-title-executor.service';
import { ImageOcrQueueService } from 'src/queue/application/queue/image-ocr-queue.service';
import { NewsQueueService } from 'src/queue/application/queue/news-queue.service';
import { CompanyEnrichQueueService } from 'src/queue/application/company-enrich-queue.service';
import { QueueController } from 'src/queue/presentation/queue.controller';
import { ResearchModule } from 'src/research/research.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { AiModule } from 'src/ai/ai.module';
import { CompanyModule } from 'src/company/company.module';
import { CoverLetterModule } from 'src/recruit/cover-letter.module';
import { TechBlogModule } from 'src/news/tech-blog/tech-blog.module';
import { PapersModule } from 'src/news/papers/papers.module';
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
    AiQueueService,
    AiJobDispatcher,
    DeepResearchExecutorService,
    LightResearchExecutorService,
    SummaryExecutorService,
    WriteAssistExecutorService,
    CompanyProfileExecutorService,
    CompanyAnalysisExecutorService,
    DocParseExecutorService,
    SpecAnalysisExecutorService,
    TechBlogTrendExecutorService,
    PaperSummaryExecutorService,
    PaperTrendExecutorService,
    NewsArticleSummaryExecutorService,
    ResumeCoverLetterCategoryExecutorService,
    ResumeCoverLetterRefinedTitleExecutorService,
    ImageOcrQueueService,
    NewsQueueService,
    CompanyEnrichQueueService,
    QueueJobRepository,
  ],
  exports: [AiQueueService, NewsQueueService, CompanyEnrichQueueService],
})
export class QueueModule {}
