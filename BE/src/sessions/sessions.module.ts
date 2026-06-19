import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsController } from 'src/sessions/presentation/sessions.controller';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';
import { SessionsService } from 'src/sessions/application/sessions.service';
import { SessionQueryService } from 'src/sessions/application/query/session-query.service';
import { SessionCommandService } from 'src/sessions/application/command/session-command.service';
import { SessionItemService } from 'src/sessions/application/session-item.service';
import { SessionItemQueryService } from 'src/sessions/application/query/session-item-query.service';
import { SessionItemCommandService } from 'src/sessions/application/command/session-item-command.service';
import { SessionEntity } from 'src/sessions/domain/entity/session.entity';
import { SessionItemEntity } from 'src/sessions/domain/entity/session-item.entity';
import { SessionJobEntity } from 'src/sessions/domain/entity/session-job.entity';
import { SessionRepository } from 'src/sessions/domain/repository/session.repository';
import { SessionItemRepository } from 'src/sessions/domain/repository/session-item.repository';
import { SessionJobRepository } from 'src/sessions/domain/repository/session-job.repository';
import { VectorModule } from 'src/vector/vector.module';
import { RecruitModule } from 'src/recruit/recruit.module';
import { ResearchModule } from 'src/research/research.module';

@Module({
  imports: [
    VectorModule,
    forwardRef(() => RecruitModule),
    forwardRef(() => ResearchModule),
    TypeOrmModule.forFeature([
      SessionEntity,
      SessionItemEntity,
      SessionJobEntity,
    ]),
  ],
  controllers: [SessionsController],
  providers: [
    SessionGateway,
    SessionsService,
    SessionQueryService,
    SessionCommandService,
    SessionItemService,
    SessionItemQueryService,
    SessionItemCommandService,
    SessionRepository,
    SessionItemRepository,
    SessionJobRepository,
  ],
  exports: [
    SessionGateway,
    SessionsService,
    SessionQueryService,
    SessionCommandService,
    SessionItemService,
    SessionItemQueryService,
    SessionItemCommandService,
    SessionJobRepository,
  ],
})
export class SessionsModule {}
