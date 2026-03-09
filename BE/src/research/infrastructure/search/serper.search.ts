import { getCircuitBreaker } from '../../../shared/resilience/circuit-breaker';

const policy = getCircuitBreaker('serper');

export async function searchSerper(query: string): Promise<string> {
  return await policy.execute(async () => {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.SERPER_API_KEY!,
      },
      body: JSON.stringify({ q: query, num: 5, hl: 'ko' }),
    });
    if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
    const data = (await res.json()) as any;
    return (
      data.organic
        ?.map((r: any) => `[${r.title}]\n${r.snippet}\n출처: ${r.link}`)
        .join('\n\n') ?? ''
    );
  });
}
