import { apiFetch } from "./base";

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  isUnread: boolean;
}

export interface GmailStatus {
  connected: boolean;
  email?: string;
}

export function getGmailAuthUrl(): Promise<{ url: string }> {
  return apiFetch("/gmail/auth-url");
}

export function getGmailStatus(): Promise<GmailStatus> {
  return apiFetch("/gmail/status");
}

export function getGmailMessages(maxResults = 10): Promise<GmailMessage[]> {
  return apiFetch(`/gmail/messages?maxResults=${maxResults}`);
}

export function disconnectGmail(): Promise<{ success: boolean }> {
  return apiFetch("/gmail/disconnect", { method: "DELETE" });
}
