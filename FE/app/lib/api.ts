import { Session, Task, ModelDefinition, SearchSources, QueueJob, ChatMessage } from "@/types";

const API_BASE = "http://localhost:3001/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? "API 오류");
  return data as T;
}

export const getModels = () =>
  apiFetch<ModelDefinition[]>("/research/models");

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

export const saveTaskResult = (
  sessionId: string,
  taskId: number,
  result: string,
  status: string,
  sources?: SearchSources
) =>
  apiFetch<{ ok: boolean }>(`/sessions/${sessionId}/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ result, status, sources }),
  });

export const searchPipeline = (prompt: string, signal?: AbortSignal) =>
  apiFetch<{ sources: SearchSources; context: string }>("/research/search", {
    method: "POST",
    body: JSON.stringify({ prompt }),
    signal,
  });

export async function searchPipelineStream(
  prompt: string,
  onSource: (key: keyof SearchSources, result: string) => void,
  signal?: AbortSignal,
): Promise<{ sources: SearchSources; context: string }> {
  const res = await fetch(`${API_BASE}/research/search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!res.ok || !res.body) throw new Error("Search stream failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "source") {
            onSource(event.key, event.result);
          } else if (event.type === "done") {
            return { sources: event.sources, context: event.context };
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { sources: {}, context: "" };
}

export const deepResearch = (prompt: string, model: string, context?: string, signal?: AbortSignal) =>
  apiFetch<{ result: string }>("/research/deep-search", {
    method: "POST",
    body: JSON.stringify({ prompt, model, context }),
    signal,
  });

export const lightResearch = (topic: string, model: string) =>
  apiFetch<{ tasks: Task[]; searchPlan?: { source: "web" | "recruit" | "both"; reason: string } }>(
    "/research/light-search",
    {
      method: "POST",
      body: JSON.stringify({ topic, model }),
    }
  );

export interface JobItem {
  title: string;
  company: string;
  location?: string | null;
  description?: string | null;
  skills: string[];
  url: string;
}

export type LightResearchEvent =
  | { type: "start" }
  | { type: "plan"; source: "web" | "recruit" | "both"; reason: string }
  | { type: "searching"; target: "web" | "recruit" }
  | { type: "log"; message: string }
  | { type: "jobs"; jobs: JobItem[] }
  | { type: "generating"; model: string }
  | { type: "done"; tasks: Task[]; searchPlan: { source: "web" | "recruit" | "both"; reason: string } };

async function readLightResearchSSE(
  res: Response,
  onEvent: (event: LightResearchEvent) => void,
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as LightResearchEvent;
          onEvent(event);
          if (event.type === "done") return;
        } catch {
          // ignore parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function lightResearchStream(
  topic: string,
  model: string,
  searchId: string,
  onEvent: (event: LightResearchEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/research/light-search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, model, searchId }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("light-search stream 실패");
  await readLightResearchSSE(res, onEvent);
}

export async function reconnectLightResearch(
  searchId: string,
  onEvent: (event: LightResearchEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/research/light-search/reconnect/${searchId}`, { signal });
  if (!res.ok || !res.body) throw new Error("reconnect 실패");
  await readLightResearchSSE(res, onEvent);
}

export const getPromptTemplates = () =>
  apiFetch<{ generateTasks: string; system: string; ollamaFilter: string }>("/overview/prompts");

export const testGenerateTasks = (
  topic: string,
  model: string,
  opts?: { customPrompt?: string; customSystem?: string }
) =>
  apiFetch<{ tasks: Task[]; searchContext?: string; fullPrompt: string }>(
    "/research/test/light-search",
    { method: "POST", body: JSON.stringify({ topic, model, ...opts }) }
  );

export const getAnthropicUsage = () =>
  apiFetch<{
    configured: boolean;
    data: {
      period: { from: string; to: string };
      totals: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens: number;
        cache_creation_input_tokens: number;
      };
      daily: any[];
    } | null;
    error?: string;
  }>("/overview/anthropic/usage");

export const getTavilyOverview = () =>
  apiFetch<{
    configured: boolean;
    usage: {
      key: { usage: number; limit: number | null; search_usage: number; crawl_usage: number; extract_usage: number; map_usage: number; research_usage: number };
      account: { current_plan: string; plan_usage: number; plan_limit: number | null; search_usage: number; crawl_usage: number; extract_usage: number; map_usage: number; research_usage: number; paygo_usage: number; paygo_limit: number | null };
    } | null;
    apiKey: string | null;
  }>("/overview/tavily");

export const getPipelineStatus = () =>
  apiFetch<{ tavily: boolean; serper: boolean; naver: boolean; brave: boolean; ollama: boolean }>(
    "/overview/pipeline-status"
  );

export const testSearchEngine = (engine: string, query: string) =>
  apiFetch<{ result: string }>("/research/test/search", {
    method: "POST",
    body: JSON.stringify({ engine, query }),
  });

export const testOllamaFilter = (query: string, context: string, customFilterPrompt?: string) =>
  apiFetch<{ result: string }>("/research/test/ollama-filter", {
    method: "POST",
    body: JSON.stringify({ query, context, customFilterPrompt }),
  });

// ── Queue API ────────────────────────────────────────────────────────────────

export interface QueueTaskPayload {
  sessionId: string;
  sessionTopic: string;
  taskId: number;
  taskTitle: string;
  taskIcon: string;
  taskPrompt: string;
  model: string;
}

export const queueGetJobs = () =>
  apiFetch<QueueJob[]>("/queue/jobs");

export const queueEnqueueSession = (tasks: QueueTaskPayload[], doneTaskIds?: number[]) =>
  apiFetch<{ ok: boolean }>("/queue/session", {
    method: "POST",
    body: JSON.stringify({ tasks, doneTaskIds }),
  });

export const queueEnqueueTask = (task: QueueTaskPayload) =>
  apiFetch<{ ok: boolean }>("/queue/task", {
    method: "POST",
    body: JSON.stringify(task),
  });

export const queueCancelSession = (sessionId: string) =>
  apiFetch<{ ok: boolean }>(`/queue/sessions/${sessionId}`, { method: "DELETE" });

export const queueDismissCompleted = () =>
  apiFetch<{ ok: boolean }>("/queue/completed", { method: "DELETE" });

// ── Chat API ─────────────────────────────────────────────────────────────────

export const getChatHistory = (sessionId: string) =>
  apiFetch<ChatMessage[]>(`/chat/${sessionId}/history`);

export const triggerCompaction = (sessionId: string) =>
  apiFetch<{ ok: boolean }>(`/chat/${sessionId}/compact`, { method: "POST" });

export const getCompactionStatus = (sessionId: string) =>
  apiFetch<{ status: "idle" | "running" | "done"; compactedAt?: string }>(
    `/chat/${sessionId}/compaction`,
  );

export const clearChatHistory = (sessionId: string) =>
  apiFetch<{ ok: boolean }>(`/chat/${sessionId}/history`, { method: "DELETE" });

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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "chunk") onChunk(event.text);
          else if (event.type === "done") return;
          else if (event.type === "error") throw new Error(event.message);
        } catch {
          // ignore parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
