import { getCircuitBreaker } from '../../../shared/resilience/circuit-breaker';

const policy = getCircuitBreaker('naver');

export async function searchNaver(query: string): Promise<string> {
  return await policy.execute(async () => {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=5&sort=date`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      },
    });
    if (!res.ok) throw new Error(`Naver HTTP ${res.status}`);
    const data = (await res.json()) as any;
    return (
      data.items
        ?.map(
          (r: any) =>
            `[${r.title.replace(/<[^>]*>/g, '')}]\n${r.description.replace(/<[^>]*>/g, '')}\n출처: ${r.link}`,
        )
        .join('\n\n') ?? ''
    );
  });
}
