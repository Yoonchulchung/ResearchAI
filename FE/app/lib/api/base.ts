// 런타임 환경에 따라 API/BE/WS 베이스 결정
// - NEXT_PUBLIC_API_BASE 설정 시 그대로 사용
// - 브라우저: 현재 origin 기반 (ingress를 통해 BE로 라우팅)
// - 서버 사이드 렌더링: http://localhost:3001 (컨테이너 내부 기본값)
function getBeBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE.replace(/\/api\/?$/, "");
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}

export const BE_BASE = getBeBase();
export const API_BASE = `${BE_BASE}/api`;
export const WS_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    : "ws://localhost:3001/ws";

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

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["X-Anon-Id"] = getAnonId();
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  });

  // 슬라이딩 JWT 갱신
  const newToken = res.headers.get("X-New-Token");
  if (newToken) tokenStore.set(newToken);

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = data.message;
    const errStr = Array.isArray(msg)
      ? msg.join(", ")
      : typeof msg === "string"
      ? msg
      : typeof msg?.message === "string"
      ? msg.message
      : typeof data.error === "string"
      ? data.error
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
