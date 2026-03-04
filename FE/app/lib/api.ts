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

export const testGenerateTasks = (topic: string, model: string) =>
  apiFetch<{ tasks: Task[]; searchContext?: string; fullPrompt: string }>(
    "/research/test/generate-tasks",
    { method: "POST", body: JSON.stringify({ topic, model }) }
  );

export const getPipelineStatus = () =>
  apiFetch<{ tavily: boolean; serper: boolean; naver: boolean; brave: boolean; ollama: boolean }>(
    "/research/pipeline-status"
  );

export const testSearchEngine = (engine: string, query: string) =>
  apiFetch<{ result: string }>("/research/test/search", {
    method: "POST",
    body: JSON.stringify({ engine, query }),
  });

export const testOllamaFilter = (query: string, context: string) =>
  apiFetch<{ result: string }>("/research/test/ollama-filter", {
    method: "POST",
    body: JSON.stringify({ query, context }),
  });
