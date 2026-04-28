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

  async findAll(userId: string | null): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepository.findAll(userId);
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

  async getSummary(id: string): Promise<{ summaryStatus: string | null; summary: string | null }> {
    const session = await this.sessionRepository.findById(id);
    return { summaryStatus: session.summaryState ?? null, summary: session.summary ?? null };
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
    const system = `당신은 데이터와 인사이트를 하나의 완성된 이야기로 엮어내는 '전략 커뮤니케이션 전문가'입니다. 
불필요한 불렛포인트(•, -)나 나열식 구성을 배제하고, 독자가 흐름을 따라 자연스럽게 정보를 습득할 수 있도록 논리적인 문장으로 기술합니다.`;

    const prompt = `다음은 "${session.topic}" 주제로 수행된 리서치 결과입니다:

${resultsText}

위 내용을 바탕으로 전문적인 톤의 서술형 보고서를 작성해주세요. 

[작성 가이드라인]
1. 전체 구성은 불렛포인트 없이 5 ~ 7개의 완성된 문단(Paragraph)으로 구성합니다.
2. 문장과 문장 사이의 논리적 연결(인과관계, 대조 등)을 강화하여 마치 하나의 칼럼처럼 읽히게 하세요.
3. 리서치 결과에 포함된 핵심 수치나 사례는 문장 속에 자연스럽게 녹여내어 전문성을 높입니다.
4. 마크다운 형식을 사용하되, 가독성을 위해 각 섹션에는 명확한 소제목을 붙여주세요.
`;

    return { model, system, prompt };
  }

  async getAttachedFileIds(sessionId: string): Promise<string[]> {
    return this.sessionRepository.getAttachedFileIds(sessionId);
  }
}
