import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../sessions/domain/entity/session.entity';
import { SessionItemEntity } from '../sessions/domain/entity/session-item.enityt';
import { ChatEntity } from '../chat/domain/entity/chat.entity';
import { ResearchRecruitEntity } from '../research/domain/entity/researchrecruit.entity';
import { LightResearchEntity } from '../research/domain/entity/lightsearch.entity';
import { SearchListEntity } from '../research/domain/entity/searchlist.entity';
import { TokenHistoryEntity } from 'src/overview/domain/entity/token-history.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/sessions.db',
      entities: [SessionEntity, SessionItemEntity, 
                 ChatEntity, ResearchRecruitEntity, 
                 LightResearchEntity, SearchListEntity,
                 TokenHistoryEntity],
      synchronize: true,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
