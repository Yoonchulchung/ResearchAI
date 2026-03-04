import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResearchModule } from './research/research.module';
import { SessionsModule } from './sessions/sessions.module';
import { OverviewModule } from './overview/overview.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ResearchModule,
    SessionsModule,
    OverviewModule,
    QueueModule,
  ],
})
export class AppModule {}
