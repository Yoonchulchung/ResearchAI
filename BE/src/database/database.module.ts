import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../sessions/domain/entity/session.entity';
import { SessionItemEntity } from '../sessions/domain/entity/session-item.entity';
import { ChatEntity } from '../chat/domain/entity/chat.entity';
import { ResearchRecruitEntity } from '../research/domain/entity/researchrecruit.entity';
import { LightResearchEntity } from '../research/domain/entity/lightsearch.entity';
import { SearchListEntity } from '../research/domain/entity/searchlist.entity';
import { TokenHistoryEntity } from 'src/overview/domain/entity/token-history.entity';
import { QueueJobEntity } from '../queue/domain/entity/queue-job.entity';
import { NewsBriefingEntity } from '../news/domain/entity/news-briefing.entity';
import { AppConfigEntity } from '../config/domain/entity/app-config.entity';
import { GmailTokenEntity } from '../gmail/domain/entity/gmail-token.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/sessions.db',
      entities: [SessionEntity, SessionItemEntity,
                 ChatEntity, ResearchRecruitEntity,
                 LightResearchEntity, SearchListEntity,
                 TokenHistoryEntity, QueueJobEntity,
                 NewsBriefingEntity, AppConfigEntity,
                 GmailTokenEntity],
      synchronize: true,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
