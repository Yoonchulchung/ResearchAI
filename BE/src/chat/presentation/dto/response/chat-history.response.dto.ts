export class ChatHistoryResponseDto {
  role: 'user' | 'assistant';
  content: string;

  static from(message: { role: 'user' | 'assistant'; content: string }): ChatHistoryResponseDto {
    const dto = new ChatHistoryResponseDto();
    dto.role = message.role;
    dto.content = message.content;
    return dto;
  }
}
