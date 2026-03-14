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
  prompt: string,
  options?: OllamaOptions,
): AsyncGenerator<string> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      format: 'json',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      options,
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

export async function callOllama(model: string, system: string, prompt: string, options?: OllamaOptions, timeoutMs?: number): Promise<string>;
export async function callOllama(model: string, system: string, prompt: string, options: OllamaOptions | undefined, timeoutMs: number | undefined, tools: OllamaTool[]): Promise<OllamaCallResult>;
export async function callOllama(
  model: string,
  system: string,
  prompt: string,
  options?: OllamaOptions,
  timeoutMs?: number,
  tools?: OllamaTool[],
): Promise<string | OllamaCallResult> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  let res: Response;
  try {
    res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        options,
        ...(tools ? { tools } : {}),
      }),
      signal: timeoutMs != null ? AbortSignal.timeout(timeoutMs) : undefined,
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
    return {
      content: data.message?.content ?? '',
      toolCalls: data.message?.tool_calls ?? [],
    };
  }
  return data.message?.content ?? '';
}
