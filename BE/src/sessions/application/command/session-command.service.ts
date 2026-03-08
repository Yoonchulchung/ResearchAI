import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VectorService } from '../../../vector/vector.service';
import { Task, Session } from '../../domain/session.model';
import { SessionRepository } from '../../domain/repository/session.repository';
import { SessionItemRepository } from '../../domain/repository/session-item.repository';
import { ResearchState } from '../../domain/entity/session.entity';
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
          webPrompt: task.prompt,
        }),
      ),
    );

    return SessionResponseDto.from(session);
  }

  async updateSession(sessionId: string, itemId: string, result: string, status: ResearchState): Promise<{ ok: boolean }> {
    if (status === ResearchState.DONE) {
      const item = await this.sessionItemRepository.findById(itemId);
      await this.sessionItemRepository.updateResult(itemId, result, ResearchState.DONE);
      this.vectorService
        .indexTaskResult(sessionId, itemId, item.topic, '📄', result)
        .catch(() => {});
    }

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

  async updateItemResult(itemId: string, result: string, status: ResearchState): Promise<void> {
    await this.sessionItemRepository.updateResult(itemId, result, status);
  }
}
