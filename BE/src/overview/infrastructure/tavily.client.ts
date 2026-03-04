export async function fetchTavilyUsage(apiKey: string): Promise<any | null> {
  try {
    const res = await fetch('https://api.tavily.com/usage', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return await res.json();
  } catch {
    // 조회 실패 시 null 반환
  }
  return null;
}
