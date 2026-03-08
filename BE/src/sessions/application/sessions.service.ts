import { Injectable } from '@nestjs/common';
import { Task } from '../domain/session.model';
import { ResearchState } from '../domain/entity/session.entity';
import { SessionResponseDto } from '../presentation/dto/response/session.response.dto';
import { SessionQueryService } from './query/session-query.service';
import { SessionCommandService } from './command/session-command.service';

/**
 * Facade — 기존 의존성(QueueService, ResearchService 등)이 그대로 사용할 수 있도록 유지.
 * 내부적으로 Query / Command 서비스에 위임합니다.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly query: SessionQueryService,
    private readonly command: SessionCommandService,
  ) {}

  // *********** //
  // DB 조회용 로직 //
  // *********** //
  findAll(): Promise<SessionResponseDto[]>   { return this.query.findAll(); }
  findOne(id: string)                        { return this.query.findOne(id); }
  findItemsWithResults(sessionId: string)    { return this.query.findItemsWithResults(sessionId); }
  getSummary(id: string)                     { return this.query.getSummary(id); }
  buildSummaryContext(id: string)            { return this.query.buildSummaryContext(id); }

  // *********** //
  // DB 작성용 로직 //
  // *********** //
  createSession(topic: string, researchCloudAIModel: string, researchLocalAIModel: string, researchWebModel: string, tasks: Task[]) {
    return this.command.createSession(topic, researchCloudAIModel, researchLocalAIModel, researchWebModel, tasks);
  }
  updateSession(sessionId: string, itemId: string, result: string, status: ResearchState) {
    return this.command.updateSession(sessionId, itemId, result, status);
  }
  updateSessionState(sessionId: string, state: ResearchState) { return this.command.updateSessionState(sessionId, state); }
  removeItem(itemId: string)                                  { return this.command.removeItem(itemId); }
  remove(id: string)                                          { return this.command.remove(id); }
  saveSummary(id: string, summary: string)                    { return this.command.saveSummary(id, summary); }

}
