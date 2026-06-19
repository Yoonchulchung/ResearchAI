import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { SessionEntity } from 'src/sessions/domain/entity/session.entity';
import { SessionItemEntity } from 'src/sessions/domain/entity/session-item.entity';
import { ChatEntity } from 'src/chat/domain/entity/chat.entity';
import { ResearchRecruitEntity } from 'src/research/domain/entity/researchrecruit.entity';
import { LightResearchEntity } from 'src/research/domain/entity/lightsearch.entity';
import { SearchListEntity } from 'src/research/domain/entity/searchlist.entity';
import { TokenHistoryEntity } from 'src/overview/domain/entity/token-history.entity';
import { QueueJobEntity } from 'src/queue/domain/entity/queue-job.entity';
import { NewsBriefingEntity } from 'src/news/domain/entity/news-briefing.entity';
import { NewsArticleSummaryEntity } from 'src/news/domain/entity/news-article-summary.entity';
import { AppConfigEntity } from 'src/config/domain/entity/app-config.entity';
import { DocumentEntity } from 'src/recruit/domain/documents/entity/document.entity';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyEnrichQueueEntity } from 'src/company/domain/entity/company-enrich-queue.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { CompanyFinancialAiAnalysisEntity } from 'src/company/domain/entity/company-financial-ai-analysis.entity';
import { CompanyInvestorTradingEntity } from 'src/company/domain/entity/company-investor-trading.entity';
import { CompanyNewsKeywordEntity } from 'src/company/domain/entity/company-news-keyword.entity';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { CompanyNewsTimelineEntity } from 'src/company/domain/entity/company-news-timeline.entity';
import { CompanyRateEntity } from 'src/company/domain/entity/company-rate.entity';
import { CompanyShortSellingEntity } from 'src/company/domain/entity/company-short-selling.entity';
import { AiCallLogEntity } from 'src/ai/domain/entity/ai-call-log.entity';
import { UserEntity } from 'src/auth/domain/entity/user.entity';
import { LoginHistoryEntity } from 'src/auth/domain/entity/login-history.entity';
import { SessionJobEntity } from 'src/sessions/domain/entity/session-job.entity';
import { PaperEntity } from 'src/news/papers/domain/entity/paper.entity';
import { PaperTrendSummaryEntity } from 'src/news/papers/domain/entity/paper-trend-summary.entity';
import { AiLeaderboardEntryEntity } from 'src/news/ai-leaderboard/domain/entity/ai-leaderboard-entry.entity';
import { TechBlogPostEntity } from 'src/news/tech-blog/domain/entity/tech-blog-post.entity';
import { TechBlogTrendSummaryEntity } from 'src/news/tech-blog/domain/entity/tech-blog-trend-summary.entity';
import { ContentRefreshStateEntity } from 'src/shared/entity/content-refresh-state.entity';
import { SystemSettingEntity } from 'src/shared/entity/system-setting.entity';
import { ExamEventEntity } from 'src/recruit/domain/exam/entity/exam-event.entity';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';
import { ResumeCoverLetterEntity } from 'src/recruit/domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from 'src/recruit/domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from 'src/recruit/domain/resume/resume-prize.entity';
import { ResumeTrainingEntity } from 'src/recruit/domain/resume/resume-training.entity';
import { ResumeVersionEntity } from 'src/recruit/domain/resume/resume-version.entity';
import { ResumeAiEvalEntity } from 'src/recruit/domain/resume/resume-ai-eval.entity';
import { RecruitResumeCompanyJdEntity } from 'src/recruit/domain/resume/recruit-resume-company-jd.entity';
import { RecruitCompanyNewsEntity } from 'src/recruit/domain/company-news/recruit-company-news.entity';
import { ResumeAttachmentEntity } from 'src/recruit/domain/resume/resume-attachment.entity';
import { CoverLetterEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterQuestionEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-question.entity';
import { CoverLetterSpecAnalysisEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-spec-analysis.entity';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';
import { RecruitJobRecommendEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-recommend.entity';

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

function renameTableIfNeeded(
  db: BetterSqliteDatabase,
  from: string,
  to: string,
): void {
  const exists = (name: string) =>
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(name);

  if (!exists(from) || exists(to)) return;
  db.prepare(
    `ALTER TABLE ${quoteIdentifier(from)} RENAME TO ${quoteIdentifier(to)}`,
  ).run();
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath,
      entities: [
        SessionEntity,
        SessionItemEntity,
        ChatEntity,
        ResearchRecruitEntity,
        LightResearchEntity,
        SearchListEntity,
        TokenHistoryEntity,
        QueueJobEntity,
        NewsBriefingEntity,
        NewsArticleSummaryEntity,
        AppConfigEntity,
        DocumentEntity,
        CompanyAnalysisEntity,
        CompanyEntity,
        CompanyEnrichQueueEntity,
        CompanyFinancialEntity,
        CompanyFinancialAiAnalysisEntity,
        CompanyInvestorTradingEntity,
        CompanyNewsKeywordEntity,
        CompanyNewsEntity,
        CompanyNewsTimelineEntity,
        CompanyRateEntity,
        CompanyShortSellingEntity,
        SessionJobEntity,
        AiCallLogEntity,
        UserEntity,
        LoginHistoryEntity,
        PaperEntity,
        PaperTrendSummaryEntity,
        AiLeaderboardEntryEntity,
        TechBlogPostEntity,
        TechBlogTrendSummaryEntity,
        ContentRefreshStateEntity,
        ExamEventEntity,
        ResumeEntity,
        ResumeCoverLetterEntity,
        ResumeExperienceEntity,
        ResumePrizeEntity,
        ResumeTrainingEntity,
        ResumeVersionEntity,
        ResumeAiEvalEntity,
        RecruitResumeCompanyJdEntity,
        RecruitCompanyNewsEntity,
        CoverLetterEntity,
        CoverLetterQuestionEntity,
        CoverLetterSpecAnalysisEntity,
        RecruitJobPostingEntity,
        RecruitJobRecommendEntity,
        ResumeAttachmentEntity,
        SystemSettingEntity,
      ],
      synchronize: true,
      // WAL 모드: 동시 읽기/쓰기 성능 향상 (다중 기기 동시 접속 대응)
      prepareDatabase: (db: BetterSqliteDatabase) => {
        renameTableIfNeeded(db, 'hot_paper', 'news_papers');
        renameTableIfNeeded(db, 'papers', 'news_papers');
        renameTableIfNeeded(db, 'exam_event', 'recruit_exam_event');
        renameTableIfNeeded(db, 'tech_blog_post', 'news_tech_blog');
        renameTableIfNeeded(
          db,
          'hot_paper_trend_summary',
          'news_papers_trend_summary',
        );
        renameTableIfNeeded(
          db,
          'papers_trend_summary',
          'news_papers_trend_summary',
        );
        renameTableIfNeeded(
          db,
          'tech_blog_trend_summary',
          'news_tech_blog_trend_summary',
        );
        renameTableIfNeeded(db, 'cover_letters', 'recruit_cover_letters');
        renameTableIfNeeded(db, 'resume', 'recruit_resume');
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
