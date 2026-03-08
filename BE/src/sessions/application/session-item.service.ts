import { Injectable } from '@nestjs/common';
import { SessionItemEntity } from '../domain/entity/session-item.enityt';
import { ResearchState } from '../domain/entity/session.entity';
import { SessionItemQueryService } from './query/session-item-query.service';
import { SessionItemCommandService } from './command/session-item-command.service';

/**
 * Facade — 기존 의존성(QueueService, ResearchService 등)이 그대로 사용할 수 있도록 유지.
 * 내부적으로 Query / Command 서비스에 위임합니다.
 */
@Injectable()
export class SessionItemService {
  constructor(
    private readonly query: SessionItemQueryService,
    private readonly command: SessionItemCommandService,
  ) {}

  findById(itemId: string): Promise<SessionItemEntity>           { return this.query.findById(itemId); }
  updateStatus(itemId: string, state: ResearchState): Promise<void> { return this.command.updateStatus(itemId, state); }
  stopActiveItemsBySession(sessionId: string): Promise<void>    { return this.command.stopActiveItemsBySession(sessionId); }
}
