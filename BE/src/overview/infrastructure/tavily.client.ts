import { getCircuitBreaker } from '../../shared/resilience/circuit-breaker';

const policy = getCircuitBreaker('tavily-usage');

export async function fetchTavilyUsage(apiKey: string): Promise<any | null> {
  try {
    return await policy.execute(async () => {
      const res = await fetch('https://api.tavily.com/usage', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Tavily usage HTTP ${res.status}`);
      return await res.json();
    });
  } catch {
    // 서킷 OPEN 또는 최종 실패 시 null 반환
    return null;
  }
}
