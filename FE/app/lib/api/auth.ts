import { apiFetch } from "./base";

export interface AuthUser {
  id: string;
  username: string;
  role: "visitor" | "admin";
  defaultCloudModel: string | null;
  defaultLocalModel: string | null;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  googleApiKey: string | null;
  tavilyApiKey: string | null;
  serperApiKey: string | null;
  naverClientId: string | null;
  naverClientSecret: string | null;
  braveApiKey: string | null;
  artificialAnalysisApiKey: string | null;
  dartApiKey: string | null;
  jobplanetId: string | null;
  jobplanetPassword: string | null;
  jobkoreaId: string | null;
  jobkoreaPassword: string | null;
  catchId: string | null;
  catchPassword: string | null;
}

export async function checkUsernameApi(username: string): Promise<{ available: boolean }> {
  return apiFetch(`/auth/check-username/${encodeURIComponent(username)}`);
}

export async function loginApi(username: string, password: string, turnstileToken?: string): Promise<{ accessToken: string }> {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, turnstileToken }),
  });
}

export async function registerApi(username: string, password: string, turnstileToken?: string, registerCode?: string): Promise<{ accessToken: string }> {
  return apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, turnstileToken, registerCode }),
  });
}

export async function getMeApi(): Promise<AuthUser> {
  return apiFetch("/auth/me");
}

export async function updateApiKeyApi(key: string, value: string): Promise<{ ok: boolean }> {
  return apiFetch("/auth/api-keys", {
    method: "PATCH",
    body: JSON.stringify({ key, value }),
  });
}

export async function updateDefaultModelsApi(
  cloudModel?: string,
  localModel?: string,
): Promise<{ ok: boolean }> {
  return apiFetch("/auth/default-models", {
    method: "PATCH",
    body: JSON.stringify({ cloudModel, localModel }),
  });
}

export interface LoginHistory {
  id: string;
  action: "login" | "register";
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export async function getLoginHistoryApi(): Promise<LoginHistory[]> {
  return apiFetch("/auth/login-history");
}
