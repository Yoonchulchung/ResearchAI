import { Injectable } from '@nestjs/common';
import { QueueDb } from './queue-db';
import { QueueJob, QueueJobStatus, QueueJobPhase } from '../domain/queue-job.model';

interface QueueJobRow {
  job_id: string;
  session_id: string;
  session_topic: string;
  task_id: number;
  task_title: string;
  task_icon: string;
  task_prompt: string;
  model: string;
  status: string;
  phase: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class QueueRepository {
  constructor(private readonly queueDb: QueueDb) {}

  private toJob(row: QueueJobRow): QueueJob {
    return {
      jobId: row.job_id,
      sessionId: row.session_id,
      sessionTopic: row.session_topic,
      taskId: row.task_id,
      taskTitle: row.task_title,
      taskIcon: row.task_icon,
      taskPrompt: row.task_prompt,
      model: row.model,
      status: row.status as QueueJobStatus,
      phase: (row.phase as QueueJobPhase) ?? undefined,
      result: row.result ?? undefined,
    };
  }

  insert(job: QueueJob): void {
    const now = new Date().toISOString();
    this.queueDb.get().prepare(`
      INSERT OR REPLACE INTO queue_jobs
        (job_id, session_id, session_topic, task_id, task_title, task_icon, task_prompt, model, status, phase, result, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.jobId, job.sessionId, job.sessionTopic, job.taskId,
      job.taskTitle, job.taskIcon, job.taskPrompt, job.model,
      job.status, job.phase ?? null, job.result ?? null, now, now,
    );
  }

  update(jobId: string, updates: Partial<Pick<QueueJob, 'status' | 'phase' | 'result'>>): void {
    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.phase !== undefined) { fields.push('phase = ?'); values.push(updates.phase); }
    if (updates.result !== undefined) { fields.push('result = ?'); values.push(updates.result); }

    values.push(jobId);
    this.queueDb.get()
      .prepare(`UPDATE queue_jobs SET ${fields.join(', ')} WHERE job_id = ?`)
      .run(...(values as Parameters<ReturnType<Database.Database['prepare']>['run']>));
  }

  delete(jobId: string): void {
    this.queueDb.get().prepare('DELETE FROM queue_jobs WHERE job_id = ?').run(jobId);
  }

  /** 서버 재시작 시 복구할 pending/running 작업 */
  findActive(): QueueJob[] {
    const rows = this.queueDb.get().prepare(
      "SELECT * FROM queue_jobs WHERE status IN ('pending', 'running') ORDER BY created_at ASC",
    ).all() as QueueJobRow[];
    return rows.map((r) => this.toJob(r));
  }

  /** 최근 완료된 이력 조회 */
  findRecent(limit = 200): QueueJob[] {
    const rows = this.queueDb.get().prepare(
      'SELECT * FROM queue_jobs ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as QueueJobRow[];
    return rows.map((r) => this.toJob(r));
  }
}
