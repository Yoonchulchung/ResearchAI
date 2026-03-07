import { Module, forwardRef } from '@nestjs/common';
import { QueueService } from './application/queue.service';
import { ResearchModule } from '../research/research.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [forwardRef(() => ResearchModule), SessionsModule],
  //controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
