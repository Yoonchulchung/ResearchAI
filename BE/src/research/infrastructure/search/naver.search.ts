export async function searchNaver(query: string): Promise<string> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=5&sort=date`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
    },
  });
  const data = (await res.json()) as any;
  return (
    data.items
      ?.map(
        (r: any) =>
          `[${r.title.replace(/<[^>]*>/g, '')}]\n${r.description.replace(/<[^>]*>/g, '')}\n출처: ${r.link}`,
      )
      .join('\n\n') ?? ''
  );
}
