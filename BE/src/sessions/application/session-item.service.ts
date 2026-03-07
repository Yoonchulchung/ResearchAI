import { Injectable } from '@nestjs/common';
import { SessionItemRepository } from '../domain/repository/session-item.repository';
import { ResearchState } from '../domain/entity/session.entity';

@Injectable()
export class SessionItemService {
  constructor(private readonly sessionItemRepository: SessionItemRepository) {}

  async updateStatus(itemId: string, state: ResearchState): Promise<void> {
    await this.sessionItemRepository.updateStatus(itemId, state);
  }
}
