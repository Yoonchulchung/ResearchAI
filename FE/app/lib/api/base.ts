// 런타임 환경에 따라 API/BE/WS 베이스 결정
// - NEXT_PUBLIC_API_BASE 설정 시 그대로 사용 (모든 환경 우선)
// - 브라우저 dev (port 3000): hostname:3001 로 직접 라우팅
// - 브라우저 prod (그 외 포트, ingress 환경): window.location.origin 으로 ingress 경유
// - 서버 사이드 렌더링: http://localhost:3001
function getBeBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE.replace(/\/api\/?$/, "");
  }
  if (typeof window !== "undefined") {
    // dev 모드: FE(3000) ↔ BE(3001) 분리
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:3001`;
    }
    return window.location.origin;
  }
  return "http://localhost:3001";
}

function getWsBase(): string {
  if (typeof window === "undefined") return "ws://localhost:3001/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // dev 모드: BE WebSocket 은 :3001
  if (window.location.port === "3000") {
    return `${proto}//${window.location.hostname}:3001/ws`;
  }
  return `${proto}//${window.location.host}/ws`;
}

export const BE_BASE = getBeBase();
export const API_BASE = `${BE_BASE}/api`;
export const WS_BASE = getWsBase();

const TOKEN_KEY = "auth_token";
const ANON_ID_KEY = "anon_id";

export const tokenStore = {
  get: (): string | null =>
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null,
  set: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    // 미들웨어(서버 사이드)에서 읽을 수 있도록 쿠키에도 저장
    document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${3 * 24 * 60 * 60}; SameSite=Lax`;
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  },
};

function getAnonId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

export function getAuthHeaders(): Record<string, string> {
  const token = tokenStore.get();
  if (token) return { "Authorization": `Bearer ${token}` };
  return { "X-Anon-Id": getAnonId() };
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 
    "Content-Type": "application/json",
    ...getAuthHeaders()
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  });

  // 슬라이딩 JWT 갱신
  const newToken = res.headers.get("X-New-Token");
  if (newToken) tokenStore.set(newToken);

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // 비-JSON 응답 (보통 HTML 에러 페이지 또는 게이트웨이/프록시 오류)
      const isHtml = text.trimStart().toLowerCase().startsWith("<!doctype") || text.includes("<html");
      const hint = isHtml
        ? "API 경로가 올바르지 않거나 서버가 응답하지 않습니다"
        : "서버 응답을 해석할 수 없습니다";
      if (!res.ok) {
        throw new Error(`${hint} (${res.status} ${res.statusText})`);
      }
      throw new Error(`${hint}`);
    }
  }
  if (!res.ok) {
    const msg = (data as { message?: unknown }).message;
    const errStr = Array.isArray(msg)
      ? msg.join(", ")
      : typeof msg === "string"
      ? msg
      : typeof (msg as { message?: unknown })?.message === "string"
      ? (msg as { message: string }).message
      : typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : `API 오류 (${res.status})`;
    throw new Error(errStr);
  }
  return data as T;
}

/** SSE 스트림에서 JSON 이벤트를 읽는 공통 헬퍼 */
export async function readSSE<T>(
  res: Response,
  onEvent: (event: T) => boolean | void,
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
