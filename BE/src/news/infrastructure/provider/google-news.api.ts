import { Injectable } from '@nestjs/common';

export interface GNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`),
  );
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

function parseRSS(xml: string): GNewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const rawTitle = extractTag(block, 'title');
    const dashIdx = rawTitle.lastIndexOf(' - ');
    const title = dashIdx > 0 ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
    const source = dashIdx > 0 ? rawTitle.slice(dashIdx + 3).trim() : '';
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description').replace(/<[^>]+>/g, '').trim();
    return { title, link, source, pubDate, description };
  });
}

@Injectable()
export class GoogleNewsApi {
  async fetchByQuery(query: string, limit = 15): Promise<GNewsItem[]> {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)' },
    });
    const xml = await res.text();
    return parseRSS(xml).slice(0, limit);
  }
}
