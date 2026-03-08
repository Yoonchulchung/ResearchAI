import { Injectable } from '@nestjs/common';
import { SessionRepository } from '../../domain/repository/session.repository';
import { SessionItemRepository } from '../../domain/repository/session-item.repository';
import { SessionResponseDto } from '../../presentation/dto/response/session.response.dto';

@Injectable()
export class SessionQueryService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly sessionItemRepository: SessionItemRepository,
  ) {}

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
