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
import { NewsArticleSummaryEntity } from '../news/domain/entity/news-article-summary.entity';
import { AppConfigEntity } from '../config/domain/entity/app-config.entity';
import { DocumentEntity } from '../recruit/domain/documents/entity/document.entity';
import { CompanyAnalysisEntity } from '../company/domain/entity/company-analysis.entity';
import { CompanyEntity } from '../company/domain/entity/company.entity';
import { CompanyEnrichQueueEntity } from '../company/domain/entity/company-enrich-queue.entity';
import { CompanyFinancialEntity } from '../company/domain/entity/company-financial.entity';
import { CompanyRateEntity } from '../company/domain/entity/company-rate.entity';
import { AiCallLogEntity } from '../ai/domain/entity/ai-call-log.entity';
import { UserEntity } from '../auth/domain/entity/user.entity';
import { LoginHistoryEntity } from '../auth/domain/entity/login-history.entity';
import { SessionJobEntity } from '../sessions/domain/entity/session-job.entity';
import { PaperEntity } from '../news/papers/domain/entity/paper.entity';
import { PaperTrendSummaryEntity } from '../news/papers/domain/entity/paper-trend-summary.entity';
import { AiLeaderboardEntryEntity } from '../news/ai-leaderboard/domain/entity/ai-leaderboard-entry.entity';
import { TechBlogPostEntity } from '../news/tech-blog/domain/entity/tech-blog-post.entity';
import { TechBlogTrendSummaryEntity } from '../news/tech-blog/domain/entity/tech-blog-trend-summary.entity';
import { ContentRefreshStateEntity } from '../shared/entity/content-refresh-state.entity';
import { SystemSettingEntity } from '../shared/entity/system-setting.entity';
import { ExamEventEntity } from '../recruit/domain/exam/entity/exam-event.entity';
import { ResumeEntity } from '../recruit/domain/resume/resume.entity';
import { ResumeCoverLetterEntity } from '../recruit/domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from '../recruit/domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from '../recruit/domain/resume/resume-prize.entity';
import { ResumeAiEvalEntity } from '../recruit/domain/resume/resume-ai-eval.entity';
import { RecruitResumeCompanyJdEntity } from '../recruit/domain/resume/recruit-resume-company-jd.entity';
import { RecruitCompanyNewsEntity } from '../recruit/domain/company-news/recruit-company-news.entity';
import { CoverLetterEntity } from '../recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterSpecAnalysisEntity } from '../recruit/domain/cover-letter/entity/cover-letter-spec-analysis.entity';
import { RecruitJobPostingEntity } from '../recruit/domain/job-posting/entity/recruit-job-posting.entity';
import { RecruitJobRecommendEntity } from '../recruit/domain/job-posting/entity/recruit-job-recommend.entity';

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

type BetterSqliteDatabase = {
  pragma: (s: string) => void;
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown;
    run: (...params: unknown[]) => unknown;
  };
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function renameTableIfNeeded(db: BetterSqliteDatabase, from: string, to: string): void {
  const exists = (name: string) =>
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name);

  if (!exists(from) || exists(to)) return;
  db.prepare(`ALTER TABLE ${quoteIdentifier(from)} RENAME TO ${quoteIdentifier(to)}`).run();
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath,
      entities: [SessionEntity, SessionItemEntity,
                 ChatEntity, ResearchRecruitEntity,
                 LightResearchEntity, SearchListEntity,
                 TokenHistoryEntity, QueueJobEntity,
                 NewsBriefingEntity, NewsArticleSummaryEntity, AppConfigEntity,
                 DocumentEntity,
                 CompanyAnalysisEntity, CompanyEntity, CompanyEnrichQueueEntity, CompanyFinancialEntity, CompanyRateEntity, SessionJobEntity,
                 AiCallLogEntity, UserEntity, LoginHistoryEntity,
                 PaperEntity, PaperTrendSummaryEntity, AiLeaderboardEntryEntity,
                 TechBlogPostEntity, TechBlogTrendSummaryEntity, ContentRefreshStateEntity,
                 ExamEventEntity, ResumeEntity, ResumeCoverLetterEntity,
                 ResumeExperienceEntity, ResumePrizeEntity, ResumeAiEvalEntity,
                 RecruitResumeCompanyJdEntity, RecruitCompanyNewsEntity, CoverLetterEntity,
                 CoverLetterSpecAnalysisEntity, RecruitJobPostingEntity, RecruitJobRecommendEntity,
                 SystemSettingEntity],
      synchronize: true,
      // WAL 모드: 동시 읽기/쓰기 성능 향상 (다중 기기 동시 접속 대응)
      prepareDatabase: (db: BetterSqliteDatabase) => {
        renameTableIfNeeded(db, 'hot_paper', 'news_papers');
        renameTableIfNeeded(db, 'papers', 'news_papers');
        renameTableIfNeeded(db, 'exam_event', 'recruit_exam_event');
        renameTableIfNeeded(db, 'tech_blog_post', 'news_tech_blog');
        renameTableIfNeeded(db, 'hot_paper_trend_summary', 'news_papers_trend_summary');
        renameTableIfNeeded(db, 'papers_trend_summary', 'news_papers_trend_summary');
        renameTableIfNeeded(db, 'tech_blog_trend_summary', 'news_tech_blog_trend_summary');
        renameTableIfNeeded(db, 'cover_letters', 'recruit_cover_letters');
        renameTableIfNeeded(
          db,
          'cover_letter_spec_analyses',
          'recruit_cover_letter_spec_analyses',
        );
        db.prepare('DROP TABLE IF EXISTS "experience"').run();
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 30000');
        db.pragma('synchronous = NORMAL');
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
