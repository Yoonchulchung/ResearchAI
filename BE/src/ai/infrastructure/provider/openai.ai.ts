import OpenAI from 'openai';
import { AiCallResult } from './anthropic.ai';

export async function callOpenAI(
  client: OpenAI,
  model: string,
  system: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  tools?: OpenAI.ChatCompletionTool[],
): Promise<AiCallResult> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'system', content: system }, ...messages],
    ...(tools ? { tools } : {}),
  });

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
  messages: { role: 'user' | 'assistant'; content: string }[],
): AsyncGenerator<string> {
  const completion = await client.chat.completions.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'system', content: system }, ...messages],
    stream: true,
  });
  for await (const chunk of completion) {
    const text = chunk.choices[0]?.delta?.content ?? '';
    if (text) yield text;
  }
}
