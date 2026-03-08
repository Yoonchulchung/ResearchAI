import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsController } from './presentation/sessions.controller';
import { SessionsService } from './application/sessions.service';
import { SessionQueryService } from './application/query/session-query.service';
import { SessionCommandService } from './application/command/session-command.service';
import { SessionItemService } from './application/session-item.service';
import { SessionItemQueryService } from './application/query/session-item-query.service';
import { SessionItemCommandService } from './application/command/session-item-command.service';
import { SessionEntity } from './domain/entity/session.entity';
import { SessionItemEntity } from './domain/entity/session-item.enityt';
import { SessionRepository } from './domain/repository/session.repository';
import { SessionItemRepository } from './domain/repository/session-item.repository';
import { VectorModule } from '../vector/vector.module';

@Module({
  imports: [VectorModule, TypeOrmModule.forFeature([SessionEntity, SessionItemEntity])],
  controllers: [SessionsController],
  providers: [SessionsService, SessionQueryService, SessionCommandService, SessionItemService, SessionItemQueryService, SessionItemCommandService, SessionRepository, SessionItemRepository],
  exports: [SessionsService, SessionQueryService, SessionCommandService, SessionItemService, SessionItemQueryService, SessionItemCommandService],
})
export class SessionsModule {}
