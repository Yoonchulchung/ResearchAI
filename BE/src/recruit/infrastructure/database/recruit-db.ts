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
    `);
    // Add new columns if they don't exist (SQLite doesn't support IF NOT EXISTS for columns)
    const addCol = (col: string) => { try { this.db.exec(`ALTER TABLE job_posting_detail_cache ADD COLUMN ${col}`); } catch {} };
    addCol('ai_analysis TEXT');
    addCol('ai_interview TEXT');
    addCol('ai_analysis_at TEXT');
    addCol('ai_interview_at TEXT');
    addCol('image_texts TEXT');
  }

  onModuleDestroy() {
    this.db?.close();
  }

  get(): Database.Database {
    return this.db;
  }

  getDetailCache(id: string): { companyType?: string; jobs?: string; detailContent?: string; detailHtml?: string } | null {
    const row = this.db.prepare(
      `SELECT company_type, jobs, detail_content, detail_html
       FROM job_posting_detail_cache
       WHERE id = ? AND cached_at > DATETIME('now', '-2 days')`,
    ).get(id) as { company_type?: string; jobs?: string; detail_content?: string; detail_html?: string } | undefined;
    if (!row) return null;
    return {
      companyType: row.company_type ?? undefined,
      jobs: row.jobs ?? undefined,
      detailContent: row.detail_content ?? undefined,
      detailHtml: row.detail_html ?? undefined,
    };
  }

  setDetailCache(id: string, data: { companyType?: string; jobs?: string; detailContent?: string; detailHtml?: string }): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO job_posting_detail_cache
         (id, company_type, jobs, detail_content, detail_html, cached_at)
       VALUES (?, ?, ?, ?, ?, DATETIME('now'))`,
    ).run(id, data.companyType ?? null, data.jobs ?? null, data.detailContent ?? null, data.detailHtml ?? null);
  }

  pruneDetailCache(): void {
    this.db.prepare(
      `DELETE FROM job_posting_detail_cache WHERE cached_at <= DATETIME('now', '-2 days')`,
    ).run();
  }

  getAiAnalysisCache(id: string, mode: 'analysis' | 'interview'): string | null {
    const col = mode === 'analysis' ? 'ai_analysis' : 'ai_interview';
    const row = this.db.prepare(`SELECT ${col} FROM job_posting_detail_cache WHERE id = ?`).get(id) as Record<string, string | null> | undefined;
    return row?.[col] ?? null;
  }

  setAiAnalysisCache(id: string, mode: 'analysis' | 'interview', text: string): void {
    const col = mode === 'analysis' ? 'ai_analysis' : 'ai_interview';
    const atCol = mode === 'analysis' ? 'ai_analysis_at' : 'ai_interview_at';
    this.db.prepare(
      `INSERT INTO job_posting_detail_cache (id, cached_at, ${col}, ${atCol})
       VALUES (?, DATETIME('now'), ?, DATETIME('now'))
       ON CONFLICT(id) DO UPDATE SET ${col} = excluded.${col}, ${atCol} = excluded.${atCol}`,
    ).run(id, text);
  }

  getImageTextsCache(id: string): string | null {
    const row = this.db.prepare(`SELECT image_texts FROM job_posting_detail_cache WHERE id = ?`).get(id) as { image_texts?: string | null } | undefined;
    return row?.image_texts ?? null;
  }

  setImageTextsCache(id: string, imageTexts: string): void {
    this.db.prepare(
      `INSERT INTO job_posting_detail_cache (id, cached_at, image_texts)
       VALUES (?, DATETIME('now'), ?)
       ON CONFLICT(id) DO UPDATE SET image_texts = excluded.image_texts`,
    ).run(id, imageTexts);
  }
}
