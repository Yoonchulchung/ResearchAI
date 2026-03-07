import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VectorService } from '../../vector/vector.service';
import { Task, Session } from '../domain/session.model';
import { SessionRepository } from '../domain/repository/session.repository';
import { SessionItemRepository } from '../domain/repository/session-item.repository';
import { ResearchState } from '../domain/entity/session.entity';

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
  async findAll(): Promise<Session[]> {
    return this.sessionRepository.findAll();
  }

  async findOne(id: string): Promise<Session> {
    return this.sessionRepository.findById(id);
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
  async createSession(topic: string, researchAiModel: string, researchWebModel: string, tasks: Task[]): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      topic,
      researchAiModel,
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

    return session;
  }

  // ************** //
  // 세션 상태 업데이트 //
  // ************** //
  async updateSession(sessionId: string, taskId: number, result: string, status: ResearchState): Promise<{ ok: boolean }> {

    // Todo: Session Item의 상태도 변경될 수 있도록 변경.
    // Todo: RUNNING 상태 저장 방법 추가.

    const items = await this.sessionItemRepository.findBySessionId(sessionId);
    // taskId는 1부터 시작하는 순서 기반 인덱스
    const item = items[taskId - 1];
    if (item && status === ResearchState.DONE) {
      await this.sessionItemRepository.updateResult(item.id, result);
      this.vectorService
        .indexTaskResult(sessionId, String(taskId), item.topic, '📄', result)
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

  async remove(id: string): Promise<{ ok: boolean }> {
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

    const model = session.researchAiModel || process.env.OLLAMA_MODEL || 'llama3.2';
    const system = '당신은 리서치 결과를 간결하고 명확하게 요약하는 전문가입니다. 핵심 인사이트를 추출하여 체계적으로 정리해주세요.';
    const prompt = `다음은 "${session.topic}" 주제로 수행된 리서치 결과입니다:\n\n${resultsText}\n\n위 내용을 바탕으로 핵심 인사이트와 주요 포인트를 한국어로 요약해주세요. 마크다운 형식으로 작성해주세요.`;

    return { model, system, prompt };
  }
}
