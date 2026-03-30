import { GoogleGenAI } from '@google/genai';
import { AiCallResult } from './anthropic.ai';
import { GEMINI_ROLE } from '../../domain/models';
import { VlmMessage, ImageContentBlock } from './vlm.types';

function toGoogleParts(content: VlmMessage['content']): any[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((c) => {
    if (typeof c === 'string') return { text: c };
    const img = c as ImageContentBlock;
    return { inlineData: { mimeType: img.mediaType, data: img.data } };
  });
}

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
  messages: VlmMessage[],
): AsyncGenerator<string> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? GEMINI_ROLE.MODEL : GEMINI_ROLE.USER,
    parts: toGoogleParts(m.content),
  }));
  const result = await client.models.generateContent({
    model,
    config: { systemInstruction: system, maxOutputTokens: 4000 },
    contents,
  });
  yield result.text ?? '';
}
