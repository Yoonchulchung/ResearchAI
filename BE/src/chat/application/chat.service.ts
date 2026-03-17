import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SessionsService } from '../../sessions/application/sessions.service';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { VectorService } from '../../vector/vector.service';
import { ChatRepository } from '../domain/repository/chat.repository';
import { ChatMessage, ChatRole } from '../domain/chat-message.model';
import { WhoSent } from '../domain/entity/chat.entity';

@Injectable()
export class ChatService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly chatRepository: ChatRepository,
    private readonly aiProvider: AiProviderService,
    private readonly vectorService: VectorService,
  ) {}

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.chatRepository.findBySessionId(sessionId);
    return rows.map((row) => ({
      role: row.whoSent === WhoSent.USER ? ChatRole.USER : ChatRole.ASSISTANT,
      content: row.message,
    }));
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.chatRepository.deleteBySessionId(sessionId);
  }

  private async appendMessage(sessionId: string, role: ChatRole, content: string): Promise<void> {
    await this.chatRepository.save({
      id: randomUUID(),
      sessionId,
      whoSent: role === ChatRole.USER ? WhoSent.USER : WhoSent.AI,
      message: content,
    });
  }

  // ******* //
  // 채팅 생성 //
  // ******* //
  async *chatStream(
    sessionId: string,
    message: string,
    aiModel: string,
  ): AsyncGenerator<string> {
    const session = await this.sessionsService.findOne(sessionId);

    await this.appendMessage(sessionId, ChatRole.USER, message);
    const history = await this.getHistory(sessionId);
    
    // RAG 컨텍스트 구성
    let ragContext: string;
    const vectorResults = await this.vectorService.search(sessionId, message, 6);

    if (vectorResults.length > 0) {
      ragContext = vectorResults
        .map((r) => `### ${r.taskTitle}\n${r.text}`)
        .join('\n\n---\n\n');
    } else {
      const items = await this.sessionsService.findItemsWithResults(sessionId);
      ragContext = items.length > 0
        ? items.map((item) => `### ${item.topic}\n${item.aiResult}`).join('\n\n---\n\n')
        : '아직 완료된 리서치 결과가 없습니다.';
    }

    const systemPrompt = `[필수 규칙] 답변에 이모지(👋📌😊 등)를 절대 사용하지 마세요. 텍스트만 사용하세요.

당신은 "${session.topic}" 분야의 시니어 리서치 애널리스트입니다.
아래 리서치 데이터를 바탕으로 사용자 질문에 답변하세요.

답변 원칙:
- 결론부터 말하고, 이유와 근거를 이어서 서술하세요.
- "~로 보입니다", "~것으로 판단됩니다" 같은 AI 특유의 단어 사용을 피하세요.
- 단순 나열 대신 흐름 있는 문장으로 서술하세요.
- 리서치 데이터에 없는 내용은 자연스럽게 녹여 서술하되, 불확실한 경우에만 "다만," 또는 "단,"으로 시작하여 한계를 짧게 언급하세요.
- 한국어로 작성하세요.

## 리서치 결과
${ragContext}`;

    const messages = history as { role: 'user' | 'assistant'; content: string }[];
    let fullResponse = '';
    for await (const chunk of this.aiProvider.stream(aiModel, systemPrompt, messages)) {
      fullResponse += chunk;
      yield chunk;
    }

    await this.appendMessage(sessionId, ChatRole.ASSISTANT, fullResponse);
  }
}
