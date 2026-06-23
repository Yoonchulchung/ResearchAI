import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { AiModule } from 'src/ai/ai.module';
import { AuthModule } from 'src/auth/auth.module';
import { ResearchModule } from 'src/research/research.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { OverviewModule } from 'src/overview/overview.module';
import { QueueModule } from 'src/queue/queue.module';
import { ChatModule } from 'src/chat/chat.module';
import { RecruitModule } from 'src/recruit/recruit.module';
import { NewsModule } from 'src/news/news.module';
import { MediaModule } from 'src/media/media.module';
import { AppConfigModule } from 'src/config/config.module';
import { DocumentsModule } from 'src/recruit/documents.module';
import { CompanyModule } from 'src/company/company.module';
import { BackgroundsModule } from 'src/backgrounds/backgrounds.module';
import { CoverLetterModule } from 'src/recruit/cover-letter.module';
import { MetricsModule } from 'src/metrics/metrics.module';
import { ExamModule } from 'src/recruit/exam.module';
import { ResumeModule } from 'src/recruit/resume.module';
import { StockModule } from 'src/stock/stock.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    AiModule,
    ResearchModule,
    SessionsModule,
    OverviewModule,
    QueueModule,
    ChatModule,
    RecruitModule,
    NewsModule,
    MediaModule,
    AppConfigModule,
    DocumentsModule,
    CompanyModule,
    BackgroundsModule,
    CoverLetterModule,
    MetricsModule,
    ExamModule,
    ResumeModule,
    StockModule,
  ],
})
export class AppModule {}
