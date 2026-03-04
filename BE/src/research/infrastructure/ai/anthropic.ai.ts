import Anthropic from '@anthropic-ai/sdk';

export async function callAnthropic(
  client: Anthropic,
  model: string,
  system: string,
  prompt: string,
  useWebSearch: boolean,
): Promise<string> {
  if (useWebSearch) {
    try {
      const response = await client.messages.create(
        {
          model,
          max_tokens: 8000,
          system,
          messages: [{ role: 'user', content: prompt }],
          tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
        } as any,
        { headers: { 'anthropic-beta': 'web-search-2025-03-05' } },
      );
      return response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as any).text)
        .join('');
    } catch {
      // 웹 검색 미지원 시 일반 API로 폴백
    }
  }

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('');
}
