import { GoogleGenAI } from '@google/genai';

export async function callGoogle(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  useSearch: boolean,
): Promise<string> {
  const config: any = useSearch ? { tools: [{ googleSearch: {} }] } : undefined;
  const response = await client.models.generateContent({ model, contents: prompt, config });
  return response.text ?? '';
}
