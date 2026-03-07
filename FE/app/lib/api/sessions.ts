import { Session, Task, ChatMessage } from "@/types";
import { apiFetch, API_BASE, readSSE } from "./base";

export const getSessions = () =>
  apiFetch<(Omit<Session, "results"> & { doneCount: number })[]>("/sessions");

export const getSession = (id: string) => apiFetch<Session>(`/sessions/${id}`);

export const createSession = (topic: string, model: string, tasks: Task[]) =>
  apiFetch<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify({ topic, model, tasks }),
  });

export const deleteSession = (id: string) =>
  apiFetch<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" });

export const updateTask = (
  sessionId: string,
  taskId: number,
  result: string,
  status: string,
  sources?: Record<string, string>,
) =>
  apiFetch<{ ok: boolean }>(`/sessions/${sessionId}/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ result, status, sources }),
  });

// ── Summary ───────────────────────────────────────────────────────────────────

export const getSessionSummary = (sessionId: string) =>
  apiFetch<{ summary: string | null }>(`/sessions/${sessionId}/summary`);

export async function streamSessionSummary(
  sessionId: string,
  model: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/summary/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
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
