export const API_BASE = "http://localhost:3001/api";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? "API 오류");
  return data as T;
}

/** SSE 스트림에서 JSON 이벤트를 읽는 공통 헬퍼 */
export async function readSSE<T>(
  res: Response,
  onEvent: (event: T) => boolean | void, // true 반환 시 조기 종료
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
          const event = JSON.parse(line.slice(6)) as T;
          if (onEvent(event) === true) return;
        } catch { /* ignore parse errors */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
