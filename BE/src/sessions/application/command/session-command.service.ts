import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VectorService } from '../../../vector/vector.service';
import { Task, Session } from '../../domain/session.model';
import { SessionRepository } from '../../domain/repository/session.repository';
import { SessionItemRepository } from '../../domain/repository/session-item.repository';
import { ResearchState } from '../../domain/entity/session.entity';
import { SummaryState } from '../../domain/entity/session.entity';
import { SessionResponseDto } from '../../presentation/dto/response/session.response.dto';

@Injectable()
export class SessionCommandService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly sessionItemRepository: SessionItemRepository,
    private readonly vectorService: VectorService,
  ) {}

  async createSession(
    topic: string,
    researchCloudAIModel: string,
    researchLocalAIModel: string,
    researchWebModel: string,
    tasks: Task[],
  ): Promise<SessionResponseDto> {
    const session: Session = {
      id: randomUUID(),
      topic,
      researchCloudAIModel,
      researchLocalAIModel,
      researchWebModel,
      summaryState: SummaryState.IDLE,
      createdAt: new Date().toISOString(),
    };
    await this.sessionRepository.save(session);

    await Promise.all(
      tasks.map((task) =>
        this.sessionItemRepository.save({
          id: randomUUID(),
          sessionId: session.id,
          topic: task.title,
          taskIcon: task.icon,
          webPrompt: task.webSearchPrompt,
        }),
      ),
    );

    return SessionResponseDto.from(session);
  }

  async updateSessionItem(
    sessionId: string,
    itemId: string,
    aiResult: string,
    webResult: string,
    status: ResearchState,
    confidence?: { score: number; reason: string },
  ): Promise<void> {
    await this.sessionItemRepository.updateResult(itemId, aiResult, webResult, status, confidence);
    if (status === ResearchState.DONE) {
      const item = await this.sessionItemRepository.findById(itemId);
      this.vectorService
        .indexTaskResult(sessionId, itemId, item.topic, '📄', aiResult)
        .catch(() => {});
    }
  }

  async updateSession(sessionId: string, status: ResearchState): Promise<{ ok: boolean }> {
    const allItems = await this.sessionItemRepository.findBySessionId(sessionId);
    const allDone = allItems.every((i) => i.aiResult);
    if (allDone) {
      await this.sessionRepository.updateState(sessionId, ResearchState.DONE);
    } else if (status === ResearchState.ERROR) {
      await this.sessionRepository.updateState(sessionId, ResearchState.ERROR);
    }
    return { ok: true };
  }

  async updateSessionState(sessionId: string, state: ResearchState): Promise<void> {
    await this.sessionRepository.updateState(sessionId, state);
  }

  async updateSummaryState(sessionId: string, state: SummaryState): Promise<void> {
    await this.sessionRepository.updateSummaryState(sessionId, state);
  }

  async removeItem(itemId: string): Promise<{ ok: boolean }> {
    await this.sessionItemRepository.delete(itemId);
    return { ok: true };
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const items = await this.sessionItemRepository.findBySessionId(id);
    await Promise.all(items.map((item) => this.sessionItemRepository.delete(item.id)));
    await this.sessionRepository.delete(id);
    await this.vectorService.deleteSession(id).catch(() => {});
    return { ok: true };
  }

  async saveSummary(id: string, summary: string): Promise<void> {
    await this.sessionRepository.updateSummary(id, summary);
  }

}
