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

export class OllamaInsufficientMemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaInsufficientMemoryError';
  }
}

function checkOllamaMemoryError(errorText: string): void {
  const lower = errorText.toLowerCase();
  if (
    lower.includes('not enough memory') ||
    lower.includes('out of memory') ||
    lower.includes('requires more system memory') ||
    lower.includes('cannot allocate memory') ||
    lower.includes('oom')
  ) {
    throw new OllamaInsufficientMemoryError(
      `메모리 부족으로 모델을 로드할 수 없습니다: ${errorText}`,
    );
  }
}

const STREAM_LOAD_TIMEOUT_MS = 60_000; // 모델 로드 대기 최대 60초

import { VlmMessage, ImageContentBlock } from './vlm.types';

function toOllamaMessages(
  system: string,
  messages: VlmMessage[] | string,
): { role: string; content: string; images?: string[] }[] {
  const msgList: VlmMessage[] =
    typeof messages === 'string'
      ? [{ role: 'user', content: messages }]
      : messages;

  return [
    { role: 'system', content: system },
    ...msgList.map((m) => {
      if (typeof m.content === 'string') return { role: m.role, content: m.content };
      const texts = m.content.filter((c): c is string => typeof c === 'string');
      const images = m.content
        .filter((c): c is ImageContentBlock => typeof c !== 'string' && c.type === 'image')
        .map((c) => c.data);
      return { role: m.role, content: texts.join('\n'), ...(images.length ? { images } : {}) };
    }),
  ];
}

export async function* streamOllama(
  model: string,
  system: string,
  messages: VlmMessage[] | string,
  opts?: { format?: 'json'; options?: OllamaOptions },
): AsyncGenerator<string> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  let res: Response;
  try {
    res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        ...(opts?.format ? { format: opts.format } : {}),
        messages: toOllamaMessages(system, messages),
        options: opts?.options,
      }),
      signal: AbortSignal.timeout(STREAM_LOAD_TIMEOUT_MS),
    });
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      throw new Error(`Ollama 모델 로드 타임아웃 (${STREAM_LOAD_TIMEOUT_MS / 1000}초): 메모리 부족으로 모델을 로드하지 못했을 수 있습니다.`);
    }
    throw new Error(`Ollama 연결 오류: ${error.message}`);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    checkOllamaMemoryError(errText);
    throw new Error(`Ollama 오류: ${res.status} ${errText}`);
  }
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
          const data = JSON.parse(line) as { message?: { content?: string }; done?: boolean; error?: string };
          if (data.error) {
            checkOllamaMemoryError(data.error);
            throw new Error(`Ollama 스트림 오류: ${data.error}`);
          }
          if (data.message?.content) yield data.message.content;
          if (data.done) return;
        } catch (e) {
          if (e instanceof OllamaInsufficientMemoryError) throw e;
          if ((e as Error).message?.startsWith('Ollama 스트림 오류')) throw e;
          /* JSON parse 실패 무시 */
        }
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
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        checkOllamaMemoryError(errText);
        // tools 미지원 모델: tools 없이 재호출하고 toolCalls 빈 배열 반환
        if (res.status === 400 && errText.includes('does not support tools') && tools) {
          const fallbackRes = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, stream: false, ...(format ? { format } : {}), messages: msgList, options }),
          });
          const fallbackData = (await fallbackRes.json()) as OllamaChatResponse;
          return { content: fallbackData.message?.content ?? '', toolCalls: [] };
        }
        throw new Error(`Ollama 오류: ${res.status} ${errText}`);
      }
      const data = (await res.json()) as OllamaChatResponse;

      if (tools) {
        return { content: data.message?.content ?? '', toolCalls: data.message?.tool_calls ?? [] };
      }
      return data.message?.content ?? '';
    } catch (err) {
      if (err instanceof OllamaInsufficientMemoryError) throw err; // 재시도 불필요
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

export async function getOllamaRunningModels(): Promise<{ name: string; size: number; size_vram: number }[]> {
  const res = await fetch(`${OLLAMA_BASE()}/api/ps`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
  const data = (await res.json()) as { models: { name: string; size: number; size_vram: number }[] };
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
