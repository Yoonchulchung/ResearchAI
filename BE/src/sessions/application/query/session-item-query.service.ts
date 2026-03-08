import { Injectable } from '@nestjs/common';
import { SessionItemRepository } from '../../domain/repository/session-item.repository';
import { SessionItemEntity } from '../../domain/entity/session-item.enityt';

@Injectable()
export class SessionItemQueryService {
  constructor(private readonly sessionItemRepository: SessionItemRepository) {}

  async findById(itemId: string): Promise<SessionItemEntity> {
    return this.sessionItemRepository.findById(itemId);
  }
}
