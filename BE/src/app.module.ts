import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';
import { ResearchModule } from './research/research.module';
import { SessionsModule } from './sessions/sessions.module';
import { OverviewModule } from './overview/overview.module';
import { QueueModule } from './queue/queue.module';
import { ChatModule } from './chat/chat.module';
import { RecruitModule } from './recruit/recruit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AiModule,
    ResearchModule,
    SessionsModule,
    OverviewModule,
    QueueModule,
    ChatModule,
    RecruitModule,
  ],
})
export class AppModule {}
