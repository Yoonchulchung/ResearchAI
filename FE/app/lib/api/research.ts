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

export async function lightResearchStream(
  params: {
    topic: string;
    searchId: string;
    localAIModel: string;
    cloudAIModel: string;
    webModel: "tavily" | "serper" | "naver" | "brave";
    searchMode?: "web" | "recruit" | "both" | "auto";
  },
  onEvent: (event: LightResearchEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/research/light-search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("light-search stream 실패");
  await readSSE<LightResearchEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done") return true;
  });
}

export async function reconnectLightResearch(
  searchId: string,
  onEvent: (event: LightResearchEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/research/light-search/reconnect/${searchId}`, { signal });
  if (!res.ok || !res.body) throw new Error("reconnect 실패");
  await readSSE<LightResearchEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done") return true;
  });
}

// ── Deep Research ─────────────────────────────────────────────────────────────

export async function deepResearch(
  sessionId: string,
  tasks: { itemId: string; prompt: string }[],
  model: string,
): Promise<{ status: string; sessionId: string }> {
  return apiFetch<{ status: string; sessionId: string }>("/research/deep-search", {
    method: "POST",
    body: JSON.stringify({ sessionId, tasks, model }),
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
