import { Module } from '@nestjs/common';
import { SessionsController } from './presentation/sessions.controller';
import { SessionsService } from './application/sessions.service';
import { SessionRepository } from './infrastructure/session-repository';
import { VectorModule } from '../vector/vector.module';

@Module({
  imports: [VectorModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionRepository],
  exports: [SessionsService],
})
export class SessionsModule {}
