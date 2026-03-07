import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsController } from './presentation/sessions.controller';
import { SessionsService } from './application/sessions.service';
import { SessionEntity } from './domain/entity/session.entity';
import { SessionItemEntity } from './domain/entity/session-item.enityt';
import { SessionRepository } from './domain/repository/session.repository';
import { SessionItemRepository } from './domain/repository/session-item.repository';
import { VectorModule } from '../vector/vector.module';

@Module({
  imports: [VectorModule, TypeOrmModule.forFeature([SessionEntity, SessionItemEntity])],
  controllers: [SessionsController],
  providers: [SessionsService, SessionRepository, SessionItemRepository],
  exports: [SessionsService],
})
export class SessionsModule {}
