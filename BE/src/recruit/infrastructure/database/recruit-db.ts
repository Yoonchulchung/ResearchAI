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
    `);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  get(): Database.Database {
    return this.db;
  }
}
