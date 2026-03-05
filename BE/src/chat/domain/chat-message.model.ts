export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompactedEntry {
  text: string;
  hash: string;
  compactedAt: Date;
}
