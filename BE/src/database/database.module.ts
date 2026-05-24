import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
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
import { ExperienceEntity } from '../recruit/domain/documents/entity/experience.entity';
import { DocumentEntity } from '../recruit/domain/documents/entity/document.entity';
import { CompanyAnalysisEntity } from '../company-analysis/domain/entity/company-analysis.entity';
import { AiCallLogEntity } from '../ai/domain/entity/ai-call-log.entity';
import { UserEntity } from '../auth/domain/entity/user.entity';
import { LoginHistoryEntity } from '../auth/domain/entity/login-history.entity';
import { SessionJobEntity } from '../sessions/domain/entity/session-job.entity';
import { HotPaperEntity } from '../news/hot-papers/domain/entity/hot-paper.entity';
import { HotPaperTrendSummaryEntity } from '../news/hot-papers/domain/entity/hot-paper-trend-summary.entity';
import { AiLeaderboardEntryEntity } from '../news/ai-leaderboard/domain/entity/ai-leaderboard-entry.entity';
import { TechBlogPostEntity } from '../news/tech-blog/domain/entity/tech-blog-post.entity';
import { TechBlogTrendSummaryEntity } from '../news/tech-blog/domain/entity/tech-blog-trend-summary.entity';
import { ContentRefreshStateEntity } from '../shared/entity/content-refresh-state.entity';
import { ExamEventEntity } from '../recruit/domain/exam/entity/exam-event.entity';
import { ResumeEntity } from '../recruit/domain/resume/resume.entity';
import { CoverLetterEntity } from '../recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterSpecAnalysisEntity } from '../recruit/domain/cover-letter/entity/cover-letter-spec-analysis.entity';

function resolveSqlitePath(): string {
  const explicitPath = process.env.DATABASE_PATH;
  if (explicitPath) return explicitPath;

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl?.startsWith('file:')) {
    return databaseUrl.slice('file:'.length);
  }

  return 'data/sessions.db';
}

const databasePath = resolveSqlitePath();
mkdirSync(dirname(databasePath), { recursive: true });

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath,
      entities: [SessionEntity, SessionItemEntity,
                 ChatEntity, ResearchRecruitEntity,
                 LightResearchEntity, SearchListEntity,
                 TokenHistoryEntity, QueueJobEntity,
                 NewsBriefingEntity, AppConfigEntity,
                 ExperienceEntity, DocumentEntity,
                 CompanyAnalysisEntity, SessionJobEntity,
                 AiCallLogEntity, UserEntity, LoginHistoryEntity,
                 HotPaperEntity, HotPaperTrendSummaryEntity, AiLeaderboardEntryEntity,
                 TechBlogPostEntity, TechBlogTrendSummaryEntity, ContentRefreshStateEntity,
                 ExamEventEntity, ResumeEntity, CoverLetterEntity,
                 CoverLetterSpecAnalysisEntity],
      synchronize: true,
      // WAL 모드: 동시 읽기/쓰기 성능 향상 (다중 기기 동시 접속 대응)
      prepareDatabase: (db: { pragma: (s: string) => void }) => {
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 30000');
        db.pragma('synchronous = NORMAL');
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
