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
  apiKeys: UserApiKeys;
}

export const requestContext = new AsyncLocalStorage<RequestUser>();

export function resolveApiKey(userKey: string | null | undefined, envKey: string | undefined): string | undefined {
  return userKey || envKey;
}
