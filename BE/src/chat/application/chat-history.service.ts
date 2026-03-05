import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { SessionsService } from '../../sessions/application/sessions.service';
import { ChatMessage } from '../domain/chat-message.model';

@Injectable()
export class ChatHistoryService {
  private histories = new Map<string, ChatMessage[]>();

  constructor(private readonly sessionsService: SessionsService) {}

  get(sessionId: string): ChatMessage[] {
    if (this.histories.has(sessionId)) return this.histories.get(sessionId)!;
    try {
      const filePath = this.sessionsService.chatPath(sessionId);
      if (fs.existsSync(filePath)) {
        const history = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ChatMessage[];
        this.histories.set(sessionId, history);
        return history;
      }
    } catch {}
    return [];
  }

  save(sessionId: string, history: ChatMessage[]): void {
    try {
      fs.writeFileSync(this.sessionsService.chatPath(sessionId), JSON.stringify(history, null, 2), 'utf-8');
    } catch {}
    this.histories.set(sessionId, history);
  }

  clear(sessionId: string): void {
    this.histories.delete(sessionId);
    try {
      const filePath = this.sessionsService.chatPath(sessionId);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }
}
