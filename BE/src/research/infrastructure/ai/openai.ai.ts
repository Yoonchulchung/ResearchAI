import OpenAI from 'openai';

export async function callOpenAI(
  client: OpenAI,
  model: string,
  system: string,
  prompt: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });
  return response.choices[0].message.content ?? '';
}
