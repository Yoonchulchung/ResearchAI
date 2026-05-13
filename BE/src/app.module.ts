import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ResearchModule } from './research/research.module';
import { SessionsModule } from './sessions/sessions.module';
import { OverviewModule } from './overview/overview.module';
import { QueueModule } from './queue/queue.module';
import { ChatModule } from './chat/chat.module';
import { RecruitModule } from './recruit/recruit.module';
import { NewsModule } from './news/news.module';
import { MediaModule } from './media/media.module';
import { AppConfigModule } from './config/config.module';
import { GmailModule } from './gmail/gmail.module';
import { DocumentsModule } from './documents/documents.module';
import { BackgroundsModule } from './backgrounds/backgrounds.module';
import { CoverLetterModule } from './cover-letter/cover-letter.module';
import { MetricsModule } from './metrics/metrics.module';
import { TechBlogModule } from './tech-blog/tech-blog.module';
import { HotPapersModule } from './hot-papers/hot-papers.module';

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
    GmailModule,
    DocumentsModule,
    BackgroundsModule,
    CoverLetterModule,
    MetricsModule,
    TechBlogModule,
    HotPapersModule,
  ],
})
export class AppModule {}
