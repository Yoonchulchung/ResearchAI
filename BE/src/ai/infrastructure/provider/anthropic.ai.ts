import Anthropic from '@anthropic-ai/sdk';

export interface ToolCallResult {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AiCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls?: ToolCallResult[];
  stopReason?: string;
}

export async function callAnthropic(
  client: Anthropic,
  model: string,
  system: string,
  messages: Anthropic.MessageParam[],
  useWebSearch: boolean,
  tools?: Anthropic.Tool[],
): Promise<AiCallResult> {
  if (useWebSearch && !tools) {
    try {
      const response = await client.messages.create(
        {
          model,
          max_tokens: 8000,
          system,
          messages,
          tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
        } as any,
        { headers: { 'anthropic-beta': 'web-search-2025-03-05' } },
      );
      return {
        text: response.content.filter((b) => b.type === 'text').map((b) => (b as any).text).join(''),
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch {
      // 웹 검색 미지원 시 일반 API로 폴백
    }
  }

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system,
    messages,
    ...(tools ? { tools } : {}),
  });

  const toolCalls = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

  return {
    text: response.content.filter((b) => b.type === 'text').map((b) => (b as any).text).join(''),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    stopReason: response.stop_reason ?? undefined,
  };
}


export async function* streamAnthropic(
  client: Anthropic,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model,
    max_tokens: 4000,
    system,
    messages,
  });
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text;
    }
  }
}
