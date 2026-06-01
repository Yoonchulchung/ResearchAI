import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsController } from './presentation/sessions.controller';
import { SessionGateway } from './presentation/session.gateway';
import { SessionsService } from './application/sessions.service';
import { SessionQueryService } from './application/query/session-query.service';
import { SessionCommandService } from './application/command/session-command.service';
import { SessionItemService } from './application/session-item.service';
import { SessionItemQueryService } from './application/query/session-item-query.service';
import { SessionItemCommandService } from './application/command/session-item-command.service';
import { SessionEntity } from './domain/entity/session.entity';
import { SessionItemEntity } from './domain/entity/session-item.entity';
import { SessionJobEntity } from './domain/entity/session-job.entity';
import { SessionRepository } from './domain/repository/session.repository';
import { SessionItemRepository } from './domain/repository/session-item.repository';
import { SessionJobRepository } from './domain/repository/session-job.repository';
import { VectorModule } from '../vector/vector.module';
import { RecruitModule } from '../recruit/recruit.module';
import { ResearchModule } from '../research/research.module';

@Module({
  imports: [
    VectorModule,
    forwardRef(() => RecruitModule),
    forwardRef(() => ResearchModule),
    TypeOrmModule.forFeature([SessionEntity, SessionItemEntity, SessionJobEntity]),
  ],
  controllers: [SessionsController],
  providers: [SessionGateway, SessionsService, SessionQueryService, SessionCommandService, SessionItemService, SessionItemQueryService, SessionItemCommandService, SessionRepository, SessionItemRepository, SessionJobRepository],
  exports: [SessionGateway, SessionsService, SessionQueryService, SessionCommandService, SessionItemService, SessionItemQueryService, SessionItemCommandService, SessionJobRepository],
})
export class SessionsModule {}
