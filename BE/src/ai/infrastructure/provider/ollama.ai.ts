interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  seed?: number;
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface OllamaCallResult {
  content: string;
  toolCalls: OllamaToolCall[];
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  total_duration?: number;
}

export async function* streamOllama(
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[] | string,
  opts?: { format?: 'json'; options?: OllamaOptions },
): AsyncGenerator<string> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const msgList = typeof messages === 'string'
    ? [{ role: 'user' as const, content: messages }]
    : messages;

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      ...(opts?.format ? { format: opts.format } : {}),
      messages: [{ role: 'system', content: system }, ...msgList],
      options: opts?.options,
    }),
  });
  if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          if (data.message?.content) yield data.message.content;
          if (data.done) return;
        } catch { /* ignore */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const CALL_MAX_RETRIES = 3;
const CALL_RETRY_DELAY_MS = 5000;

export async function callOllama(model: string, system: string, prompt: string, options?: OllamaOptions, timeoutMs?: number, tools?: undefined, format?: 'json', signal?: AbortSignal): Promise<string>;
export async function callOllama(model: string, system: string, prompt: string | any[], options: OllamaOptions | undefined, timeoutMs: number | undefined, tools: OllamaTool[], format?: 'json', signal?: AbortSignal): Promise<OllamaCallResult>;
export async function callOllama(
  model: string,
  system: string,
  prompt: string | any[],
  options?: OllamaOptions,
  timeoutMs?: number,
  tools?: OllamaTool[],
  format?: 'json',
  signal?: AbortSignal,
): Promise<string | OllamaCallResult> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const msgList = typeof prompt === 'string'
    ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
    : [{ role: 'system', content: system }, ...prompt];

  let lastError: unknown;
  for (let attempt = 0; attempt <= CALL_MAX_RETRIES; attempt++) {
    // 콜드 스타트로 모델 로드 실패가 있어 재시도 로직 추가.
    try {
      let res: Response;
      try {
        res = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            ...(format ? { format } : {}),
            messages: msgList,
            options,
            ...(tools ? { tools } : {}),
          }),
          signal: timeoutMs != null && signal
            ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
            : timeoutMs != null
            ? AbortSignal.timeout(timeoutMs)
            : signal,
        });
      } catch (error: any) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new Error(`Ollama 요청 시간 초과 (${timeoutMs}ms)`);
        }
        throw new Error(`Ollama 통신 오류: ${error.message}`);
      }
      if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
      const data = (await res.json()) as OllamaChatResponse;

      if (tools) {
        return { content: data.message?.content ?? '', toolCalls: data.message?.tool_calls ?? [] };
      }
      return data.message?.content ?? '';
    } catch (err) {
      lastError = err;
      if (attempt < CALL_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, CALL_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

const OLLAMA_BASE = () => process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export async function getOllamaLocalModels(): Promise<{ name: string }[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE()}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

export async function getOllamaRunningModels(): Promise<{ name: string; size_vram: number }[]> {
  const res = await fetch(`${OLLAMA_BASE()}/api/ps`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
  const data = (await res.json()) as { models: { name: string; size_vram: number }[] };
  return data.models ?? [];
}

export async function unloadOllamaModel(model: string): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: 0 }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
}
