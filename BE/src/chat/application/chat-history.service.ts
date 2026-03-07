import { Injectable } from '@nestjs/common';
import { ChatMessage } from '../domain/chat-message.model';

@Injectable()
export class ChatHistoryService {
  private histories = new Map<string, ChatMessage[]>();

  get(sessionId: string): ChatMessage[] {
    return this.histories.get(sessionId) ?? [];
  }

  save(sessionId: string, history: ChatMessage[]): void {
    this.histories.set(sessionId, history);
  }

  clear(sessionId: string): void {
    this.histories.delete(sessionId);
  }
}
