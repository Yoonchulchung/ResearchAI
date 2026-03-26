import { API_BASE, apiFetch, readSSE } from "./base";

export interface OllamaRunningModel {
  name: string;
  size: number;
  size_vram: number;
}

export interface SystemMemory {
  total: number;
  free: number;
  used: number;
  cached: number;
}

export async function getRunningOllamaModels(): Promise<OllamaRunningModel[]> {
  return apiFetch<OllamaRunningModel[]>("/ai/ollama/running");
}

export async function getSystemMemory(): Promise<SystemMemory> {
  return apiFetch<SystemMemory>("/ai/system/memory");
}

export async function unloadOllamaModel(model: string): Promise<void> {
  await apiFetch<void>(`/ai/ollama/unload/${encodeURIComponent(model)}`, { method: "POST" });
}

export async function improveTask(
  topic: string,
  title: string,
  prompt: string,
  model: string,
): Promise<{ title: string; prompt: string }> {
  return apiFetch<{ title: string; prompt: string }>("/ai/improve-task", {
    method: "POST",
    body: JSON.stringify({ topic, title, prompt, model }),
  });
}

export async function chatTasks(
  topic: string,
  tasks: Array<{ id: number; title: string; webSearchPrompt: string }>,
  message: string,
  model: string,
  history: Array<{ role: string; content: string }>,
): Promise<{ tasks: typeof tasks; reply: string }> {
  return apiFetch("/ai/chat-tasks", {
    method: "POST",
    body: JSON.stringify({ topic, tasks, message, model, history }),
  });
}

export async function enqueueCompanyProfile(
  companyName: string,
  model: string,
): Promise<{ jobId: string }> {
  return apiFetch('/queue/company-profile', {
    method: 'POST',
    body: JSON.stringify({ companyName, model }),
  });
}

export async function streamCompanyProfile(
  jobId: string,
  onEvent: (event: SummaryEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/company-profile/${jobId}/stream`, { signal });
  if (!res.ok || !res.body) throw new Error('Company profile stream 실패');
  await readSSE<SummaryEvent>(res, (event) => {
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') return true;
  });
}

export async function enqueueWriteAssist(
  content: string,
  instruction: string,
  model: string,
): Promise<{ jobId: string }> {
  return apiFetch('/queue/write-assist', {
    method: 'POST',
    body: JSON.stringify({ content, instruction, model }),
  });
}

export async function streamWriteAssist(
  jobId: string,
  onEvent: (event: SummaryEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/write-assist/${jobId}/stream`, { signal });
  if (!res.ok || !res.body) throw new Error('Write assist stream 실패');
  await readSSE<SummaryEvent>(res, (event) => {
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') return true;
  });
}

export async function generateSessionTitle(
  topic: string,
  tasks: Array<{ title: string }>,
  model: string,
): Promise<{ title: string }> {
  return apiFetch('/ai/generate-title', {
    method: 'POST',
    body: JSON.stringify({ topic, tasks, model }),
  });
}

export async function reEvaluateConfidence(
  itemId: string,
  model: string,
): Promise<{ score: number; reason: string }> {
  return apiFetch("/ai/re-evaluate-confidence", {
    method: "POST",
    body: JSON.stringify({ itemId, model }),
  });
}

export type SummaryEvent =
  | { type: "log"; message: string }
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * POST /ai/summary/stream
 * jobId 기반 멱등성: 같은 jobId면 기존 작업을 재생
 */
export async function streamAiSummary(
  jobId: string,
  sessionId: string,
  model: string,
  onEvent: (event: SummaryEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/summary/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, sessionId, model }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("AI summary stream 실패");
  await readSSE<SummaryEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done" || event.type === "error") return true;
  });
}

/**
 * GET /ai/summary/reconnect/:jobId
 * 연결이 끊긴 후 재접속
 */
export async function reconnectAiSummary(
  jobId: string,
  onEvent: (event: SummaryEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/summary/reconnect/${jobId}`, { signal });
  if (!res.ok || !res.body) throw new Error("AI summary reconnect 실패");
  await readSSE<SummaryEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done" || event.type === "error") return true;
  });
}
