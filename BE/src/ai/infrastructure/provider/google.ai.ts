import { GoogleGenAI } from '@google/genai';
import { AiCallResult } from './anthropic.ai';
import { GEMINI_ROLE } from '../../domain/models';

export async function callGoogle(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  useSearch: boolean,
): Promise<AiCallResult> {
  const config: any = useSearch ? { tools: [{ googleSearch: {} }] } : undefined;
  const response = await client.models.generateContent({ model, contents: prompt, config });
  return {
    text: response.text ?? '',
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function* streamGoogle(
  client: GoogleGenAI,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): AsyncGenerator<string> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? GEMINI_ROLE.MODEL : GEMINI_ROLE.USER,
    parts: [{ text: m.content }],
  }));
  const result = await client.models.generateContent({
    model,
    config: { systemInstruction: system, maxOutputTokens: 4000 },
    contents,
  });
  yield result.text ?? '';
}
