import Anthropic from '@anthropic-ai/sdk';
import { VlmMessage, ImageContentBlock } from 'src/ai/infrastructure/provider/vlm.types';

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
  /** Anthropic 내장 웹검색 또는 에이전트 루프에서 실제 수행된 검색 기록 */
  searchLog?: { query: string; result: string }[];
}

export async function callAnthropic(
  client: Anthropic,
  model: string,
  system: string,
  messages: Anthropic.MessageParam[],
  useWebSearch: boolean,
  tools?: Anthropic.Tool[],
  signal?: AbortSignal,
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
        { headers: { 'anthropic-beta': 'web-search-2025-03-05' }, signal },
      );

      // 검색 쿼리와 결과를 searchLog로 추출
      const searchLog: { query: string; result: string }[] = [];
      const blocks = response.content as any[];
      for (const block of blocks) {
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          const query: string = block.input?.query ?? '';
          // 해당 tool_use_id와 매칭되는 결과 블록 찾기
          const resultBlock = blocks.find(
            (b) =>
              b.type === 'web_search_tool_result' && b.tool_use_id === block.id,
          );
          const result = resultBlock?.content
            ? (resultBlock.content as any[])
                .map((r: any) =>
                  `[${r.title ?? ''}]\n${r.url ?? ''}\n${r.encrypted_content ?? ''}`.trim(),
                )
                .join('\n\n')
            : '';
          if (query) searchLog.push({ query, result });
        }
      }

      return {
        text: blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join(''),
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        searchLog: searchLog.length ? searchLog : undefined,
      };
    } catch {
      // 웹 검색 미지원 시 일반 API로 폴백
    }
  }

  const response = await client.messages.create(
    {
      model,
      max_tokens: 8000,
      system,
      messages,
      ...(tools ? { tools } : {}),
    },
    { signal },
  );

  const toolCalls = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map((b) => ({
      id: b.id,
      name: b.name,
      input: b.input as Record<string, unknown>,
    }));

  return {
    text: response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join(''),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    stopReason: response.stop_reason ?? undefined,
  };
}

function toAnthropicContent(
  content: VlmMessage['content'],
): Anthropic.ContentBlockParam[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content.map((c): Anthropic.ContentBlockParam => {
    if (typeof c === 'string') return { type: 'text', text: c };
    const img = c;
    return {
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    };
  });
}

export async function* streamAnthropic(
  client: Anthropic,
  model: string,
  system: string,
  messages: VlmMessage[],
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model,
    max_tokens: 4000,
    system,
    messages: messages.map((m) => ({
      role: m.role,
      content: toAnthropicContent(m.content),
    })),
  });
  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text;
    }
  }
}
