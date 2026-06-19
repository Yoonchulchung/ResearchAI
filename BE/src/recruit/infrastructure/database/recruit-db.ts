import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class RecruitDb implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;

  onModuleInit() {
    const dbDir = path.join(process.cwd(), 'data/recruit');
    fs.mkdirSync(dbDir, { recursive: true });

    this.db = new Database(path.join(dbDir, 'recruit.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS job_postings (
        id          TEXT PRIMARY KEY,
        source      TEXT NOT NULL,
        source_type TEXT NOT NULL,
        title       TEXT NOT NULL,
        company     TEXT NOT NULL,
        location    TEXT,
        description TEXT,
        skills      TEXT DEFAULT '[]',
        url         TEXT UNIQUE NOT NULL,
        posted_at   TEXT,
        collected_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_source       ON job_postings(source);
      CREATE INDEX IF NOT EXISTS idx_company      ON job_postings(company);
      CREATE INDEX IF NOT EXISTS idx_collected_at ON job_postings(collected_at);

      CREATE TABLE IF NOT EXISTS job_posting_favorites (
        user_id    TEXT NOT NULL,
        job_id     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_job_posting_favorites_user
        ON job_posting_favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_job_posting_favorites_job
        ON job_posting_favorites(job_id);

      CREATE TABLE IF NOT EXISTS job_posting_detail_cache (
        id           TEXT PRIMARY KEY,
        company_type TEXT,
        jobs         TEXT,
        detail_content TEXT,
        detail_html  TEXT,
        cached_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS company_profiles (
        normalized_name TEXT PRIMARY KEY,
        company_name    TEXT NOT NULL,
        company_type    TEXT NOT NULL,
        source          TEXT NOT NULL,
        evidence        TEXT,
        updated_at      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_posting_crawl_checkpoints (
        id         TEXT PRIMARY KEY,
        data       TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_posting_applications (
        user_id    TEXT NOT NULL,
        job_id     TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        PRIMARY KEY (user_id, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_job_posting_applications_user
        ON job_posting_applications(user_id);
    `);
    // Add new columns if they don't exist (SQLite doesn't support IF NOT EXISTS for columns)
    const addCol = (table: string, col: string) => {
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
      } catch {}
    };
    addCol('job_posting_detail_cache', 'ai_analysis TEXT');
    addCol('job_posting_detail_cache', 'ai_interview TEXT');
    addCol('job_posting_detail_cache', 'ai_analysis_at TEXT');
    addCol('job_posting_detail_cache', 'ai_interview_at TEXT');
    addCol('job_posting_detail_cache', 'image_texts TEXT');
    addCol('job_posting_detail_cache', 'ai_analysis_doc_id TEXT');
    addCol('job_posting_detail_cache', 'ai_interview_doc_id TEXT');

    addCol('job_postings', 'company_type TEXT');
    addCol('job_postings', 'type TEXT');
    addCol('job_postings', 'start_date TEXT');
    addCol('job_postings', 'end_date TEXT');
    addCol('job_postings', 'deadline TEXT');
    addCol('job_postings', 'jobs TEXT');
    addCol('job_postings', 'homepage TEXT');
    addCol('job_postings', 'category TEXT');
    addCol('job_postings', 'view_count INTEGER');
    addCol('job_postings', 'detail_content TEXT');
    addCol('job_postings', 'detail_html TEXT');
    addCol('job_postings', 'search_text TEXT');

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_job_postings_company_type ON job_postings(company_type);
      CREATE INDEX IF NOT EXISTS idx_job_postings_type ON job_postings(type);
      CREATE INDEX IF NOT EXISTS idx_job_postings_category ON job_postings(category);
      CREATE INDEX IF NOT EXISTS idx_job_postings_start_date ON job_postings(start_date);
      CREATE INDEX IF NOT EXISTS idx_job_postings_end_date ON job_postings(end_date);
    `);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  get(): Database.Database {
    return this.db;
  }

  getDetailCache(id: string): {
    companyType?: string;
    jobs?: string;
    detailContent?: string;
    detailHtml?: string;
  } | null {
    const row = this.db
      .prepare(
        `SELECT company_type, jobs, detail_content, detail_html
       FROM job_posting_detail_cache
       WHERE id = ? AND cached_at > DATETIME('now', '-2 days')`,
      )
      .get(id) as
      | {
          company_type?: string;
          jobs?: string;
          detail_content?: string;
          detail_html?: string;
        }
      | undefined;
    if (!row) return null;
    return {
      companyType: row.company_type ?? undefined,
      jobs: row.jobs ?? undefined,
      detailContent: row.detail_content ?? undefined,
      detailHtml: row.detail_html ?? undefined,
    };
  }

  setDetailCache(
    id: string,
    data: {
      companyType?: string;
      jobs?: string;
      detailContent?: string;
      detailHtml?: string;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO job_posting_detail_cache
         (id, company_type, jobs, detail_content, detail_html, cached_at)
       VALUES (?, ?, ?, ?, ?, DATETIME('now'))
       ON CONFLICT(id) DO UPDATE SET
         company_type   = excluded.company_type,
         jobs           = excluded.jobs,
         detail_content = excluded.detail_content,
         detail_html    = excluded.detail_html,
         cached_at      = excluded.cached_at`,
      )
      .run(
        id,
        data.companyType ?? null,
        data.jobs ?? null,
        data.detailContent ?? null,
        data.detailHtml ?? null,
      );
  }

  pruneDetailCache(): void {
    this.db
      .prepare(
        `DELETE FROM job_posting_detail_cache
       WHERE cached_at <= DATETIME('now', '-2 days')
         AND ai_analysis IS NULL
         AND ai_interview IS NULL`,
      )
      .run();
  }

  getAiAnalysisCache(
    id: string,
    mode: 'analysis' | 'interview',
  ): { text: string; docId: string | null } | null {
    const col = mode === 'analysis' ? 'ai_analysis' : 'ai_interview';
    const docCol =
      mode === 'analysis' ? 'ai_analysis_doc_id' : 'ai_interview_doc_id';
    const row = this.db
      .prepare(
        `SELECT ${col}, ${docCol} FROM job_posting_detail_cache WHERE id = ?`,
      )
      .get(id) as Record<string, string | null> | undefined;
    if (!row?.[col]) return null;
    return { text: row[col], docId: row[docCol] ?? null };
  }

  setAiAnalysisCache(
    id: string,
    mode: 'analysis' | 'interview',
    text: string,
    docId?: string | null,
  ): void {
    const col = mode === 'analysis' ? 'ai_analysis' : 'ai_interview';
    const atCol = mode === 'analysis' ? 'ai_analysis_at' : 'ai_interview_at';
    const docCol =
      mode === 'analysis' ? 'ai_analysis_doc_id' : 'ai_interview_doc_id';
    this.db
      .prepare(
        `INSERT INTO job_posting_detail_cache (id, cached_at, ${col}, ${atCol}, ${docCol})
       VALUES (?, DATETIME('now'), ?, DATETIME('now'), ?)
       ON CONFLICT(id) DO UPDATE SET ${col} = excluded.${col}, ${atCol} = excluded.${atCol}, ${docCol} = excluded.${docCol}`,
      )
      .run(id, text, docId ?? null);
  }

  getImageTextsCache(id: string): string | null {
    const row = this.db
      .prepare(`SELECT image_texts FROM job_posting_detail_cache WHERE id = ?`)
      .get(id) as { image_texts?: string | null } | undefined;
    return row?.image_texts ?? null;
  }

  setImageTextsCache(id: string, imageTexts: string): void {
    this.db
      .prepare(
        `INSERT INTO job_posting_detail_cache (id, cached_at, image_texts)
       VALUES (?, DATETIME('now'), ?)
       ON CONFLICT(id) DO UPDATE SET image_texts = excluded.image_texts`,
      )
      .run(id, imageTexts);
  }
}
