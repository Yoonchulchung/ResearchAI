import { Module } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { ResearchModule } from '../research/research.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ResearchModule, SessionsModule],
  controllers: [QueueController],
  providers: [QueueService],
})
export class QueueModule {}
