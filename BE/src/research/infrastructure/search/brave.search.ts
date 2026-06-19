import { getCircuitBreaker } from 'src/shared/resilience/circuit-breaker';

const policy = getCircuitBreaker('brave');

export async function searchBrave(query: string): Promise<string> {
  return await policy.execute(async () => {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&lang=ko`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_API_KEY!,
      },
    });
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const data = await res.json();
    return (
      data.web?.results
        ?.map((r: any) => `[${r.title}]\n${r.description}\n출처: ${r.url}`)
        .join('\n\n') ?? ''
    );
  });
}
