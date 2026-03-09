export enum ChatRole {
  USER      = 'user',
  ASSISTANT = 'assistant',
  SYSTEM    = 'system',
}

export const ChatRoleLabel: Record<ChatRole, string> = {
  [ChatRole.USER]:      '사용자',
  [ChatRole.ASSISTANT]: 'AI',
  [ChatRole.SYSTEM]:    'System',
};

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompactedEntry {
  text: string;
  hash: string;
  compactedAt: Date;
}
