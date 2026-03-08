import { Task, ModelDefinition } from "@/types";
import { apiFetch, API_BASE, readSSE } from "./base";

export const getModels = () =>
  apiFetch<ModelDefinition[]>("/research/models");

// ── Light Research ────────────────────────────────────────────────────────────

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

export async function enqueueLightResearch(params: {
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: "tavily" | "serper" | "naver" | "brave";
  searchMode?: "web" | "recruit" | "both" | "auto";
}): Promise<{ searchId: string; status: string }> {
  return apiFetch<{ searchId: string; status: string }>("/queue/research/light", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function subscribeLightResearch(
  searchId: string,
  onEvent: (event: LightResearchEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/research/light/${searchId}/stream`, { signal });
  if (!res.ok || !res.body) throw new Error("light-search stream 실패");
  await readSSE<LightResearchEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done") return true;
  });
}

export async function cancelLightResearch(searchId: string): Promise<void> {
  await apiFetch(`/queue/research/light/${searchId}`, { method: "DELETE" });
}

// ── Deep Research ─────────────────────────────────────────────────────────────

export async function deepResearch(
  sessionId: string,
  items: { itemId: string; prompt: string }[],
  localAIModel: string,
  cloudAIModel: string,
): Promise<{ status: string; sessionId: string }> {
  return apiFetch<{ status: string; sessionId: string }>(`/queue/research/${sessionId}/deep`, {
    method: "POST",
    body: JSON.stringify({ items, localAIModel, cloudAIModel, status: "start" }),
  });
}

export async function stopResearch(sessionId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/queue/research/${sessionId}/deep`, { method: "DELETE" });
}

export async function stopResearchItem(sessionId: string, itemId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/queue/research/${sessionId}/deep/items/${itemId}`, {
    method: "DELETE",
  });
}

// ── Test / Debug ──────────────────────────────────────────────────────────────

export const testGenerateTasks = (
  topic: string,
  model: string,
  opts?: { customPrompt?: string; customSystem?: string; searchMode?: "web" | "recruit" | "both" | "auto" },
) =>
  apiFetch<{ tasks: Task[]; searchContext?: string; fullPrompt: string; searchPlan: { source: "web" | "recruit" | "both"; reason: string; keyword: string } }>(
    "/research/test/light-search",
    { method: "POST", body: JSON.stringify({ topic, model, ...opts }) },
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
