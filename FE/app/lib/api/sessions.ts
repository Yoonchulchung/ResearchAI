import { Session, Task, ChatMessage } from "@/types";
import { apiFetch, API_BASE, readSSE } from "./base";

export const getSessions = () =>
  apiFetch<Session[]>("/sessions");

export const getSession = (id: string) => apiFetch<Session>(`/sessions/${id}`);

export const createSession = (topic: string, researchCloudAIModel: string, researchLocalAIModel: string, researchWebModel: string, tasks: Task[]) =>
  apiFetch<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify({ topic, researchCloudAIModel, researchLocalAIModel, researchWebModel, tasks }),
  });

export const deleteSession = (id: string) =>
  apiFetch<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" });

export const deleteSessionItem = (sessionId: string, itemId: string) =>
  apiFetch<{ ok: boolean }>(`/sessions/${sessionId}/items/${itemId}`, { method: "DELETE" });

export const updateTask = (
  sessionId: string,
  itemId: string,
  result: string,
  status: string,
) =>
  apiFetch<{ ok: boolean }>(`/sessions/${sessionId}/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify({ result, status }),
  });

// ── Summary ───────────────────────────────────────────────────────────────────

export const getSessionSummary = (sessionId: string) =>
  apiFetch<{ summary: string | null }>(`/sessions/${sessionId}/summary`);

export async function requestSessionSummary(
  sessionId: string,
  localAIModel: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/sessions/${sessionId}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ localAIModel }),
  });
  if (!res.ok) throw new Error("Summary 요청 실패");
}

export async function streamSessionSummary(
  sessionId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/sessions/${sessionId}/summary/stream`, {
    method: "GET",
    signal,
  });
  if (!res.ok || !res.body) throw new Error("Summary stream 실패");

  await readSSE<{ type: string; text?: string; message?: string }>(res, (event) => {
    if (event.type === "chunk" && event.text) onChunk(event.text);
    else if (event.type === "done") return true;
    else if (event.type === "error") throw new Error(event.message);
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export const getChatHistory = (sessionId: string) =>
  apiFetch<ChatMessage[]>(`/chat/${sessionId}/history`);

export const clearChatHistory = (sessionId: string) =>
  apiFetch<{ ok: boolean }>(`/chat/${sessionId}/history`, { method: "DELETE" });

export const triggerCompaction = (sessionId: string) =>
  apiFetch<{ ok: boolean }>(`/chat/${sessionId}/compact`, { method: "POST" });

export const getCompactionStatus = (sessionId: string) =>
  apiFetch<{ status: "idle" | "running" | "done"; compactedAt?: string }>(
    `/chat/${sessionId}/compaction`,
  );

export async function chatStream(
  sessionId: string,
  message: string,
  model: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, model }),
  });
  if (!res.ok || !res.body) throw new Error("Chat stream failed");

  await readSSE<{ type: string; text?: string; message?: string }>(res, (event) => {
    if (event.type === "chunk" && event.text) onChunk(event.text);
    else if (event.type === "done") return true;
    else if (event.type === "error") throw new Error(event.message);
  });
}
