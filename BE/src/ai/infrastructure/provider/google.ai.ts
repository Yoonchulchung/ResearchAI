import { GoogleGenAI } from '@google/genai';
import { AiCallResult } from './anthropic.ai';

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
