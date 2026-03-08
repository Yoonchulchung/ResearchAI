import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VectorService } from '../../vector/vector.service';
import { Task, Session } from '../domain/session.model';
import { SessionRepository } from '../domain/repository/session.repository';
import { SessionItemRepository } from '../domain/repository/session-item.repository';
import { ResearchState } from '../domain/entity/session.entity';
import { SessionResponseDto } from '../presentation/dto/response/session.response.dto';

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly sessionItemRepository: SessionItemRepository,
    private readonly vectorService: VectorService,
  ) {}

  // ******* //
  // 세션 조회 //
  // ******* //
  async findAll(): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepository.findAll();
    return sessions.map(SessionResponseDto.from);
  }

  async findOne(id: string): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findById(id);
    return SessionResponseDto.from(session);
  }
  
  async findItemsWithResults(sessionId: string): Promise<{ topic: string; aiResult: string }[]> {
    const items = await this.sessionItemRepository.findBySessionId(sessionId);
    return items
      .filter((item) => item.aiResult)
      .map((item) => ({ topic: item.topic, aiResult: item.aiResult }));
  }

  async getSummary(id: string): Promise<{ summary: string | null }> {
    const session = await this.sessionRepository.findById(id);
    return { summary: session.summary ?? null };
  }

  // ******* //
  // 세션 생성 //
  // ******* //
  async createSession(topic: string, researchCloudAIModel: string, researchLocalAIModel: string, researchWebModel: string, tasks: Task[]): Promise<SessionResponseDto> {
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

  // ************** //
  // 세션 상태 업데이트 //
  // ************** //
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

  async removeItem(_sessionId: string, itemId: string): Promise<{ ok: boolean }> {
    await this.sessionItemRepository.delete(itemId);
    return { ok: true };
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const items = await this.sessionItemRepository.findBySessionId(id);
    await Promise.all(items.map((item) => this.sessionItemRepository.delete(item.id)));
    await this.sessionRepository.delete(id);
    this.vectorService.deleteSession(id).catch(() => {});
    return { ok: true };
  }

  // ************ //
  // 세션 서머리 저장 //
  // ************ //
  async saveSummary(id: string, summary: string): Promise<void> {
    await this.sessionRepository.updateSummary(id, summary);
  }

  // ****************** //
  // 서머리 생성용 컨텍스트 //
  // ****************** //
  async buildSummaryContext(id: string): Promise<{ model: string; system: string; prompt: string } | null> {
    const session = await this.sessionRepository.findById(id);
    const items = await this.sessionItemRepository.findBySessionId(id);

    const doneItems = items.filter((item) => item.aiResult);
    if (doneItems.length === 0) return null;

    const resultsText = doneItems
      .map((item) => `## ${item.topic}\n${item.aiResult}`)
      .join('\n\n---\n\n');

    const model = session.researchCloudAIModel || session.researchLocalAIModel || process.env.OLLAMA_MODEL || 'llama3.2';
    const system = '당신은 리서치 결과를 간결하고 명확하게 요약하는 전문가입니다. 핵심 인사이트를 추출하여 체계적으로 정리해주세요.';
    const prompt = `다음은 "${session.topic}" 주제로 수행된 리서치 결과입니다:\n\n${resultsText}\n\n위 내용을 바탕으로 핵심 인사이트와 주요 포인트를 한국어로 요약해주세요. 마크다운 형식으로 작성해주세요.`;

    return { model, system, prompt };
  }
}
