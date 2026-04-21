import { AsyncLocalStorage } from 'async_hooks';

export interface UserApiKeys {
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  googleApiKey?: string | null;
  tavilyApiKey?: string | null;
  serperApiKey?: string | null;
  naverClientId?: string | null;
  naverClientSecret?: string | null;
  braveApiKey?: string | null;
}

export interface RequestUser {
  id: string;
  username: string;
  role: 'visitor' | 'admin';
  defaultCloudModel: string | null;
  defaultLocalModel: string | null;
  apiKeys: UserApiKeys;
}

export const DEFAULT_AI_MODEL = () => process.env.DEFAULT_AI_MODEL ?? 'gemini-2.0-flash-lite';
export const DEFAULT_GOOGLE_API_KEY = () => process.env.DEFAULT_GOOGLE_API_KEY ?? '';
export const DEFAULT_GROQ_API_KEY = () => process.env.DEFAULT_GROQ_API_KEY ?? '';
export const DEFAULT_GROQ_MODEL = () => process.env.DEFAULT_GROQ_MODEL ?? 'llama-3.3-70b-versatile';

export const requestContext = new AsyncLocalStorage<RequestUser>();
