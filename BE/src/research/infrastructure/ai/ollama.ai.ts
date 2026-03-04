export async function callOllama(model: string, system: string, prompt: string): Promise<string> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
  const data = (await res.json()) as any;
  return data.message?.content ?? '';
}
