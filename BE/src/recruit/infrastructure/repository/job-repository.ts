import { Injectable } from '@nestjs/common';
import { RecruitDb } from '../database/recruit-db';
import { JobPosting } from '../../domain/job-posting.model';

interface JobRow {
  id: string;
  source: string;
  source_type: string;
  title: string;
  company: string;
  location: string;
  description: string;
  skills: string;
  url: string;
  posted_at: string | null;
  collected_at: string;
}

export interface JobFilter {
  keyword?: string;
  source?: string;
  company?: string;
}

@Injectable()
export class JobRepository {
  constructor(private readonly recruitDb: RecruitDb) {}

  upsert(job: JobPosting): void {
    this.recruitDb.get().prepare(`
      INSERT INTO job_postings
        (id, source, source_type, title, company, location, description, skills, url, posted_at, collected_at)
      VALUES
        (@id, @source, @sourceType, @title, @company, @location, @description, @skills, @url, @postedAt, @collectedAt)
      ON CONFLICT(url) DO UPDATE SET
        title        = excluded.title,
        company      = excluded.company,
        location     = excluded.location,
        description  = excluded.description,
        skills       = excluded.skills,
        collected_at = excluded.collected_at
    `).run({
      ...job,
      sourceType: job.sourceType,
      skills: JSON.stringify(job.skills),
    });
  }

  findAll(filter: JobFilter = {}): JobPosting[] {
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (filter.keyword) {
      conditions.push(`(title LIKE @keyword OR company LIKE @keyword OR description LIKE @keyword)`);
      params.keyword = `%${filter.keyword}%`;
    }
    if (filter.source) {
      conditions.push(`source = @source`);
      params.source = filter.source;
    }
    if (filter.company) {
      conditions.push(`company LIKE @company`);
      params.company = `%${filter.company}%`;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.recruitDb.get()
      .prepare(`SELECT * FROM job_postings ${where} ORDER BY collected_at DESC`)
      .all(params) as JobRow[];

    return rows.map(this.toModel);
  }

  findById(id: string): JobPosting | null {
    const row = this.recruitDb.get()
      .prepare(`SELECT * FROM job_postings WHERE id = ?`)
      .get(id) as JobRow | undefined;
    return row ? this.toModel(row) : null;
  }

  delete(id: string): boolean {
    const result = this.recruitDb.get()
      .prepare(`DELETE FROM job_postings WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  deleteAll(): number {
    const result = this.recruitDb.get().prepare(`DELETE FROM job_postings`).run();
    return result.changes;
  }

  stats(): { total: number; bySources: Record<string, number>; lastCollectedAt: string | null } {
    const total = (this.recruitDb.get()
      .prepare(`SELECT COUNT(*) as cnt FROM job_postings`)
      .get() as { cnt: number }).cnt;

    const bySourceRows = this.recruitDb.get()
      .prepare(`SELECT source, COUNT(*) as cnt FROM job_postings GROUP BY source`)
      .all() as { source: string; cnt: number }[];

    const bySources = Object.fromEntries(bySourceRows.map((r) => [r.source, r.cnt]));

    const lastRow = this.recruitDb.get()
      .prepare(`SELECT MAX(collected_at) as last FROM job_postings`)
      .get() as { last: string | null };

    return { total, bySources, lastCollectedAt: lastRow.last };
  }

  private toModel(row: JobRow): JobPosting {
    return {
      id: row.id,
      source: row.source,
      sourceType: row.source_type as 'crawler' | 'api',
      title: row.title,
      company: row.company,
      location: row.location ?? '',
      description: row.description ?? '',
      skills: JSON.parse(row.skills || '[]') as string[],
      url: row.url,
      postedAt: row.posted_at,
      collectedAt: row.collected_at,
    };
  }
}
