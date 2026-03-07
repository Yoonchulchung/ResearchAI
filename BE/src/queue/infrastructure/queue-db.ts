import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class QueueDb implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;

  onModuleInit() {
    const dbDir = path.join(process.cwd(), 'data/queue');
    fs.mkdirSync(dbDir, { recursive: true });

    this.db = new Database(path.join(dbDir, 'queue.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_jobs (
        job_id        TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL,
        session_topic TEXT NOT NULL,
        task_id       INTEGER NOT NULL,
        task_title    TEXT NOT NULL,
        task_icon     TEXT NOT NULL,
        task_prompt   TEXT NOT NULL,
        model         TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        phase         TEXT,
        result        TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queue_session ON queue_jobs(session_id);
      CREATE INDEX IF NOT EXISTS idx_queue_status  ON queue_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_queue_created ON queue_jobs(created_at);
    `);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  get(): Database.Database {
    return this.db;
  }
}
