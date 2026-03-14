import OpenAI from 'openai';
import { AiCallResult } from './anthropic.ai';

export async function callOpenAI(
  client: OpenAI,
  model: string,
  system: string,
  prompt: string,
): Promise<AiCallResult> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });
  return {
    text: response.choices[0].message.content ?? '',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
