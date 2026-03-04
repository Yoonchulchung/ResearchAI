import { Session, Task, ModelDefinition, SearchSources } from "../types";

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

export const runResearch = (prompt: string, model: string, context?: string, signal?: AbortSignal) =>
  apiFetch<{ result: string }>("/research", {
    method: "POST",
    body: JSON.stringify({ prompt, model, context }),
    signal,
  });

export const generateTasks = (topic: string, model: string) =>
  apiFetch<{ tasks: Task[] }>("/research/generate-tasks", {
    method: "POST",
    body: JSON.stringify({ topic, model }),
  });

export const getPromptTemplates = () =>
  apiFetch<{ generateTasks: string; system: string; ollamaFilter: string }>("/research/prompts");

export const testGenerateTasks = (
  topic: string,
  model: string,
  opts?: { customPrompt?: string; customSystem?: string }
) =>
  apiFetch<{ tasks: Task[]; searchContext?: string; fullPrompt: string }>(
    "/research/test/generate-tasks",
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
  }>("/research/anthropic/usage");

export const getTavilyOverview = () =>
  apiFetch<{
    configured: boolean;
    usage: {
      key: { usage: number; limit: number | null; search_usage: number; crawl_usage: number; extract_usage: number; map_usage: number; research_usage: number };
      account: { current_plan: string; plan_usage: number; plan_limit: number | null; search_usage: number; crawl_usage: number; extract_usage: number; map_usage: number; research_usage: number; paygo_usage: number; paygo_limit: number | null };
    } | null;
    apiKey: string | null;
  }>("/research/tavily/overview");

export const getPipelineStatus = () =>
  apiFetch<{ tavily: boolean; serper: boolean; naver: boolean; brave: boolean; ollama: boolean }>(
    "/research/pipeline-status"
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
