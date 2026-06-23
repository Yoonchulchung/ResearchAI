import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, ItemWithResult } from 'src/sessions/domain/session.model';
import {
  ResearchState,
  SessionEntity,
  SummaryState,
} from 'src/sessions/domain/entity/session.entity';

@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly repo: Repository<SessionEntity>,
  ) {}

  async findById(id: string): Promise<Session> {
    const row = await this.repo.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!row) throw new NotFoundException('Session not found');
    return this.toModel(row, true);
  }

  async findAll(userId: string | null): Promise<Session[]> {
    if (!userId) return [];
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: { items: true },
    });
    return rows.map((r) => this.toModel(r, false));
  }

  async save(session: Session, state?: ResearchState): Promise<void> {
    await this.repo.save({
      id: session.id,
      userId: session.userId ?? null,
      topic: session.topic,
      researchCloudAIModel: session.researchCloudAIModel,
      researchLocalAIModel: session.researchLocalAIModel,
      researchWebModel: session.researchWebModel,
      researchState: state ?? ResearchState.IDLE,
      sessionType: session.sessionType ?? 'research',
      lightResearchId: session.lightResearchId ?? null,
    });
  }

  async updateState(id: string, state: ResearchState): Promise<void> {
    await this.repo.update(id, { researchState: state });
  }

  async updateSummary(id: string, summary: string): Promise<void> {
    await this.repo.update(id, { summary });
  }

  async updateSummaryState(id: string, state: SummaryState): Promise<void> {
    await this.repo.update(id, { summaryState: state });
  }

  async updateAttachedFileIds(id: string, fileIds: string[]): Promise<void> {
    await this.repo.update(id, { attachedFileIds: fileIds });
  }

  async getAttachedFileIds(id: string): Promise<string[]> {
    const row = await this.repo.findOne({
      where: { id },
      select: ['attachedFileIds'],
    });
    return row?.attachedFileIds ?? [];
  }

  async delete(id: string): Promise<void> {
    const exists = await this.repo.findOne({ where: { id } });
    if (!exists) throw new NotFoundException('Session not found');
    await this.repo.delete(id);
  }

  private toModel(row: SessionEntity, withTasks: boolean): Session {
    const sortedItems = row.items
      ? [...row.items].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
      : [];

    const doneCount = sortedItems.filter((i) => i.aiResult).length;

    const items: ItemWithResult[] = sortedItems.map((item, idx) => ({
      id: idx + 1,
      itemId: item.id,
      title: item.topic,
      webSearchPrompt: item.webPrompt,
      status: item.researchState,
      researchState: item.researchState,
      webResult: item.webResult || null,
      webModel: row.researchWebModel,
      usedWebModel: item.usedWebModel ?? null,
      searchLog: item.searchLog
        ? (() => {
            try {
              return JSON.parse(item.searchLog);
            } catch {
              return null;
            }
          })()
        : null,
      result: item.aiResult || null,
      chartData: item.chartData
        ? (() => {
            try {
              return JSON.parse(item.chartData);
            } catch {
              return null;
            }
          })()
        : null,
      confidenceScore: item.confidenceScore ?? null,
      confidenceReason: item.confidenceReason ?? null,
      inputTokens: item.inputTokens ?? null,
      outputTokens: item.outputTokens ?? null,
      estimatedFees: item.estimatedFees ?? null,
    }));

    return {
      id: row.id,
      userId: row.userId ?? null,
      topic: row.topic,
      researchCloudAIModel: row.researchCloudAIModel,
      researchLocalAIModel: row.researchLocalAIModel,
      researchWebModel: row.researchWebModel,
      researchState: row.researchState,
      summaryState: row.summaryState ?? null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      summary: row.summary,
      items: withTasks ? items : undefined,
      doneCount,
      sessionType: row.sessionType ?? 'research',
      lightResearchId: row.lightResearchId ?? null,
    };
  }
}
