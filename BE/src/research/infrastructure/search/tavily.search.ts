import { tavily } from '@tavily/core';

export async function searchTavily(query: string): Promise<string> {
  const depth = (process.env.TAVILY_SEARCH_DEPTH || 'basic') as 'basic' | 'advanced';
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  const response = await client.search(query, { searchDepth: depth, maxResults: 5 });
  return (
    response.results
      .map((r) => `[${r.title}]\n${r.content}\n출처: ${r.url}`)
      .join('\n\n') ?? ''
  );
}
