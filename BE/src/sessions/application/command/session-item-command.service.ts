import { Injectable } from '@nestjs/common';
import { SessionItemRepository } from '../../domain/repository/session-item.repository';
import { ResearchState } from '../../domain/entity/session.entity';

@Injectable()
export class SessionItemCommandService {
  constructor(private readonly sessionItemRepository: SessionItemRepository) {}

  async updateStatus(itemId: string, state: ResearchState): Promise<void> {
    await this.sessionItemRepository.updateStatus(itemId, state);
  }

  async stopActiveItemsBySession(sessionId: string): Promise<void> {
    const items = await this.sessionItemRepository.findBySessionId(sessionId);
    const active = items.filter(
      (i) => i.researchState === ResearchState.PENDING || i.researchState === ResearchState.RUNNING,
    );
    await Promise.all(active.map((i) => this.sessionItemRepository.updateStatus(i.id, ResearchState.STOPPED)));
  }
}
