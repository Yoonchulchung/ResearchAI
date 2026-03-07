import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SessionsService } from '../../sessions/application/sessions.service';
import { AiChatService } from '../../ai/application/ai-chat.service';
import { ChatRepository } from '../domain/repository/chat.repository';
import { ChatMessage } from '../domain/chat-message.model';
import { WhoSent } from '../domain/entity/chat.entity';

@Injectable()
export class ChatService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly chatRepository: ChatRepository,
    private readonly aiChatService: AiChatService,
  ) {}

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.chatRepository.findBySessionId(sessionId);
    return rows.map((row) => ({
      role: row.whoSent === WhoSent.USER ? 'user' : 'assistant',
      content: row.message,
    }));
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.chatRepository.deleteBySessionId(sessionId);
  }

  private async appendMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    await this.chatRepository.save({
      id: randomUUID(),
      sessionId,
      whoSent: role === 'user' ? WhoSent.USER : WhoSent.AI,
      message: content,
    });
  }

  // ******* //
  // 채팅 생성 //
  // ******* //
  async *chatStream(
    sessionId: string,
    message: string,
    model: string,
  ): AsyncGenerator<string> {
    const session = await this.sessionsService.findOne(sessionId);

    await this.appendMessage(sessionId, 'user', message);
    const history = await this.getHistory(sessionId);
    
    let fullResponse = '';
    for await (const chunk of this.aiChatService.stream(sessionId, session.topic, message, model, history)) {
      fullResponse += chunk;
      yield chunk;
    }

    await this.appendMessage(sessionId, 'assistant', fullResponse);
  }
}
