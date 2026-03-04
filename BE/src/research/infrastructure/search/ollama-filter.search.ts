import { PROMPTS } from '../../domain/prompt/research.prompts';

export async function filterWithOllama(query: string, context: string, customPrompt?: string): Promise<string> {
  if (!context) return context;
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'phi4';
    const prompt = customPrompt
      ? customPrompt.replaceAll('{{query}}', query).replaceAll('{{context}}', context)
      : PROMPTS.ollamaFilter(query, context);
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, prompt, stream: false }),
      signal: AbortSignal.timeout(3000000),
    });
    if (!res.ok) return context;
    const data = (await res.json()) as any;
    return data.response || context;
  } catch {
    return context;
  }
}
