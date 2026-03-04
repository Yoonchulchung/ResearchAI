export async function searchBrave(query: string): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&lang=ko`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': process.env.BRAVE_API_KEY!,
    },
  });
  const data = (await res.json()) as any;
  return (
    data.web?.results
      ?.map((r: any) => `[${r.title}]\n${r.description}\n출처: ${r.url}`)
      .join('\n\n') ?? ''
  );
}
