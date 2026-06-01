import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './application/queue.service';
import { DeepResearchExecutorService } from './application/job/deep-research-executor.service';
import { LightResearchExecutorService } from './application/job/light-research-executor.service';
import { SummaryExecutorService } from './application/job/summary-executor.service';
import { WriteAssistExecutorService } from './application/job/write-assist/write-assist-executor.service';
import { CompanyProfileExecutorService } from './application/job/company-profile-executor.service';
import { CompanyAnalysisExecutorService } from './application/job/company-analysis-executor.service';
import { DocParseExecutorService } from './application/job/doc-parse-executor.service';
import { SpecAnalysisExecutorService } from './application/job/spec-analysis-executor.service';
import { TechBlogTrendExecutorService } from './application/job/tech-blog-trend-executor.service';
import { PaperSummaryExecutorService } from './application/job/paper-summary-executor.service';
import { PaperTrendExecutorService } from './application/job/paper-trend-executor.service';
import { NewsArticleSummaryExecutorService } from './application/job/news-article-summary-executor.service';
import { ResumeCoverLetterCategoryExecutorService } from './application/job/resume-cover-letter-category-executor.service';
import { ResumeCoverLetterRefinedTitleExecutorService } from './application/job/resume-cover-letter-refined-title-executor.service';
import { ImageOcrQueueService } from './application/image-ocr-queue.service';
import { QueueController } from './presentation/queue.controller';
import { ResearchModule } from '../research/research.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AiModule } from '../ai/ai.module';
import { CompanyModule } from '../company/company.module';
import { CoverLetterModule } from '../recruit/cover-letter.module';
import { TechBlogModule } from '../news/tech-blog/tech-blog.module';
import { PapersModule } from '../news/papers/papers.module';
import { NewsModule } from '../news/news.module';
import { ResumeModule } from '../recruit/resume.module';
import { QueueJobEntity } from './domain/entity/queue-job.entity';
import { QueueJobRepository } from './domain/repository/queue-job.repository';
import { AppConfigModule } from '../config/config.module';

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
    TypeOrmModule.forFeature([QueueJobEntity]),
    AppConfigModule,
  ],
  controllers: [QueueController],
  providers: [
    QueueService,
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
    QueueJobRepository,
  ],
  exports: [QueueService],
})
export class QueueModule {}
