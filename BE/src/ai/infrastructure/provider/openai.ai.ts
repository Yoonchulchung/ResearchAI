import OpenAI from 'openai';
import { AiCallResult } from './anthropic.ai';
import { VlmMessage, ImageContentBlock } from './vlm.types';

function toOpenAIContent(content: VlmMessage['content']): OpenAI.ChatCompletionContentPart[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content.map((c): OpenAI.ChatCompletionContentPart => {
    if (typeof c === 'string') return { type: 'text', text: c };
    const img = c as ImageContentBlock;
    return { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } };
  });
}

export async function callOpenAI(
  client: OpenAI,
  model: string,
  system: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  tools?: OpenAI.ChatCompletionTool[],
  signal?: AbortSignal,
): Promise<AiCallResult> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'system', content: system }, ...messages],
    ...(tools ? { tools } : {}),
  }, { signal });

  const choice = response.choices[0];
  const toolCalls = choice.message.tool_calls
    ?.filter((c) => c.type === 'function')
    .map((c) => ({
      id: c.id,
      name: c.function.name,
      input: JSON.parse(c.function.arguments) as Record<string, unknown>,
    }));

  return {
    text: choice.message.content ?? '',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    stopReason: choice.finish_reason ?? undefined,
  };
}

export async function* streamOpenAI(
  client: OpenAI,
  model: string,
  system: string,
  messages: VlmMessage[],
): AsyncGenerator<string> {
  const completion = await client.chat.completions.create({
    model,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: toOpenAIContent(m.content) } as OpenAI.ChatCompletionMessageParam)),
    ],
    stream: true,
  });
  for await (const chunk of completion) {
    const text = chunk.choices[0]?.delta?.content ?? '';
    if (text) yield text;
  }
}
