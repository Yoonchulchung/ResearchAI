import { Task, ModelDefinition } from "@/types";
import { apiFetch, API_BASE, readSSE } from "./base";

export const getModels = () =>
  apiFetch<ModelDefinition[]>("/research/models");

export interface WebSearchEngine {
  id: string;
  name: string;
  builtin: boolean;
}

export const getSearchEngines = () =>
  apiFetch<WebSearchEngine[]>("/research/search-engines");

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

export interface AttachedFilePayload {
  type: string;       // 'image' | 'pdf' | 'docx'
  mediaType?: string; // 'image/jpeg' | 'image/png' etc.
  dataUrl?: string;   // base64 data URL for images
  text?: string;      // extracted text for PDFs/docs
}

export async function enqueueLightResearch(params: {
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: string;
  searchMode?: "web" | "recruit" | "both" | "auto";
  attachedFiles?: AttachedFilePayload[];
}): Promise<{ searchId: string; status: string }> {
  const result = await apiFetch<{ searchId: string; status: string }>("/queue/research/light", {
    method: "POST",
    body: JSON.stringify(params),
  });
  window.dispatchEvent(new CustomEvent("queue:enqueue"));
  return result;
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
  items: { itemId: string; content: string }[],
  aiModel?: string,
  webModel?: string,
  filterModel?: string,
): Promise<{ status: string; sessionId: string }> {
  const result = await apiFetch<{ status: string; sessionId: string }>(`/queue/research/${sessionId}/deep`, {
    method: "POST",
    body: JSON.stringify({ items, aiModel, webModel, filterModel, status: "start" }),
  });
  window.dispatchEvent(new CustomEvent("queue:enqueue"));
  return result;
}

export async function stopResearch(sessionId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/queue/research/${sessionId}/deep`, { method: "DELETE" });
}

export async function stopResearchItem(sessionId: string, itemId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/queue/research/${sessionId}/deep/items/${itemId}`, {
    method: "DELETE",
  });
}

// ── Test / Debug — Pipeline Steps ─────────────────────────────────────────────

export interface SearchPlan {
  searchMode: "web" | "recruit" | "both";
  reason: string;
  keyword: string;
  companyTypes?: string[];
  jobTypes?: string[];
  model?: string;
}

export const testPipelineStep0 = (topic: string, localAIModel: string, searchMode?: string) =>
  apiFetch<{ logs: string[]; searchPlan: SearchPlan }>("/research/test/pipeline/step0", {
    method: "POST",
    body: JSON.stringify({ topic, localAIModel, searchMode }),
  });

export const testPipelineStep1a = (keyword: string, webModel?: string) =>
  apiFetch<{ logs: string[]; webContext: string | undefined }>("/research/test/pipeline/step1a", {
    method: "POST",
    body: JSON.stringify({ keyword, webModel }),
  });

export const testPipelineStep1b = (keyword: string, companyTypes?: string[], jobTypes?: string[]) =>
  apiFetch<{ logs: string[]; jobs: JobItem[]; recruitCtx: string | undefined }>("/research/test/pipeline/step1b", {
    method: "POST",
    body: JSON.stringify({ keyword, companyTypes, jobTypes }),
  });

export const testPipelineStep2 = (topic: string, model: string, searchPlan: SearchPlan, webContext?: string, recruitCtx?: string) =>
  apiFetch<{ logs: string[]; tasks: any[] }>("/research/test/pipeline/step2", {
    method: "POST",
    body: JSON.stringify({ topic, model, searchPlan, webContext, recruitCtx }),
  });

export const testLiveSearch = (keyword: string, companyTypes?: string[], jobTypes?: string[]) =>
  apiFetch<{ logs: string[]; jobs: JobItem[]; result: string }>("/recruit/test/live-search", {
    method: "POST",
    body: JSON.stringify({ keyword, companyTypes, jobTypes }),
  });

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
