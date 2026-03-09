import { getCircuitBreaker } from '../../shared/resilience/circuit-breaker';

const policy = getCircuitBreaker('anthropic-usage');

export async function fetchAnthropicUsageReport(
  adminKey: string,
  startingAt: string,
  endingAt: string,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const url = new URL('https://api.anthropic.com/v1/organizations/usage_report/messages');
  url.searchParams.set('starting_at', startingAt);
  url.searchParams.set('ending_at', endingAt);
  url.searchParams.set('bucket_width', '1d');

  return await policy.execute(async () => {
    const res = await fetch(url.toString(), {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': adminKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error?.message ?? `HTTP ${res.status}`);
    }

    return { ok: true, status: res.status, data: await res.json() };
  });
}
