import { API_BASE, readSSE } from "./base";

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
