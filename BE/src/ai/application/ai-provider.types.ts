export interface ToolCallResult {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AiCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls?: ToolCallResult[];
  stopReason?: string;
  searchLog?: { query: string; result: string }[];
}

export interface ImageContentBlock {
  type: 'image';
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;
}

export type VlmContent = string | Array<string | ImageContentBlock>;

export interface VlmMessage {
  role: 'user' | 'assistant';
  content: VlmContent;
}

export type AiProviderCredentialMode = 'request' | 'default';

export interface AiProviderCallRequest {
  model: string;
  system: string;
  promptText: string;
  messages: unknown[];
  useBuiltinSearch: boolean;
  tools?: unknown[];
  signal?: AbortSignal;
  credentialMode?: AiProviderCredentialMode;
}

export interface AiProviderStreamRequest {
  model: string;
  system: string;
  messages: VlmMessage[];
  credentialMode?: AiProviderCredentialMode;
}
