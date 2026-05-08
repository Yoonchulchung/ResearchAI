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
import { ExperienceEntity } from '../documents/domain/entity/experience.entity';
import { DocumentEntity } from '../documents/domain/entity/document.entity';
import { CompanyAnalysisEntity } from '../documents/domain/entity/company-analysis.entity';
import { AiCallLogEntity } from '../ai/domain/entity/ai-call-log.entity';
import { UserEntity } from '../auth/domain/entity/user.entity';
import { LoginHistoryEntity } from '../auth/domain/entity/login-history.entity';
import { SessionJobEntity } from '../sessions/domain/entity/session-job.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DATABASE_PATH ?? 'data/sessions.db',
      entities: [SessionEntity, SessionItemEntity,
                 ChatEntity, ResearchRecruitEntity,
                 LightResearchEntity, SearchListEntity,
                 TokenHistoryEntity, QueueJobEntity,
                 NewsBriefingEntity, AppConfigEntity,
                 GmailTokenEntity, ExperienceEntity, DocumentEntity,
                 CompanyAnalysisEntity, SessionJobEntity,
                 AiCallLogEntity, UserEntity, LoginHistoryEntity],
      synchronize: true,
      // WAL 모드: 동시 읽기/쓰기 성능 향상 (다중 기기 동시 접속 대응)
      prepareDatabase: (db: { pragma: (s: string) => void }) => {
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
