import { Injectable } from '@nestjs/common';
import { SessionItemRepository } from 'src/sessions/domain/repository/session-item.repository';
import { ResearchState } from 'src/sessions/domain/entity/session.entity';

@Injectable()
export class SessionItemCommandService {
  constructor(private readonly sessionItemRepository: SessionItemRepository) {}

  async updateStatus(itemId: string, state: ResearchState): Promise<void> {
    await this.sessionItemRepository.updateStatus(itemId, state);
  }

  async updateConfidence(
    itemId: string,
    confidence: { score: number; reason: string },
  ): Promise<void> {
    await this.sessionItemRepository.updateConfidence(
      itemId,
      confidence.score,
      confidence.reason,
    );
  }

  async stopActiveItemsBySession(sessionId: string): Promise<void> {
    const items = await this.sessionItemRepository.findBySessionId(sessionId);
    const active = items.filter(
      (i) =>
        i.researchState === ResearchState.PENDING ||
        i.researchState === ResearchState.RUNNING,
    );
    await Promise.all(
      active.map((i) =>
        this.sessionItemRepository.updateStatus(i.id, ResearchState.STOPPED),
      ),
    );
  }
}
