import { Injectable } from '@nestjs/common';
import { SessionItemRepository } from 'src/sessions/domain/repository/session-item.repository';
import { SessionItemEntity } from 'src/sessions/domain/entity/session-item.entity';

@Injectable()
export class SessionItemQueryService {
  constructor(private readonly sessionItemRepository: SessionItemRepository) {}

  async findById(itemId: string): Promise<SessionItemEntity> {
    return this.sessionItemRepository.findById(itemId);
  }
}
