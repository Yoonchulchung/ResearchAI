import { Injectable } from '@nestjs/common';
import { ChatMessage } from 'src/chat/domain/chat-message.model';
import { AttachedTextDto } from 'src/chat/presentation/dto/request/chat-message.dto';
import { ChatStreamImplService } from 'src/chat/application/stream/chat-stream-impl.service';

export interface ChatStreamEvent {
  type: 'chunk' | 'status';
  text: string;
}

@Injectable()
export class ChatService {
  constructor(private readonly impl: ChatStreamImplService) {}

  getHistory(sessionId: string): Promise<ChatMessage[]> {
    return this.impl.getHistory(sessionId);
  }

  clearHistory(sessionId: string): Promise<void> {
    return this.impl.clearHistory(sessionId);
  }

  chatStream(
    sessionId: string,
    message: string,
    aiModel: string,
    attachedTexts?: AttachedTextDto[],
  ): AsyncGenerator<ChatStreamEvent> {
    return this.impl.chatStream(sessionId, message, aiModel, attachedTexts);
  }
}
