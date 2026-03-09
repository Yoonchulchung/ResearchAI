import { ChatMessage, ChatRole } from '../../../domain/chat-message.model';

export class ChatHistoryResponseDto {
  role: ChatRole;
  content: string;

  static from(message: ChatMessage): ChatHistoryResponseDto {
    const dto = new ChatHistoryResponseDto();
    dto.role = message.role;
    dto.content = message.content;
    return dto;
  }
}
