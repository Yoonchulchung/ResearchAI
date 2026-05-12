import { load } from 'cheerio';
import type { TechBlogPost, TechBlogSource } from '../domain/tech-blog.types';

export const REQUEST_TIMEOUT_MS = 12_000;

export async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ResearchAI-TechBlogCrawler/1.0 (+https://github.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function parseFeed(xml: string, source: TechBlogSource): TechBlogPost[] {
  const $ = load(xml, { xmlMode: true });
  const posts: TechBlogPost[] = [];

  $('item').each((_, el) => {
    const item = $(el);
    const title = cleanText(item.children('title').first().text());
    const url = absoluteUrl(cleanText(item.children('link').first().text()) || item.children('guid').first().text(), source.url);
    if (!title || !url) return;

      const htmlContent =
        item.children('description').first().text() ||
        item.children('content\\:encoded').first().text();
      const summary = summaryFromHtml(htmlContent);
      const publishedAt = toIsoDate(item.children('pubDate').first().text() || item.children('dc\\:date').first().text());
      const thumbnail =
        item.children('media\\:content').first().attr('url') ||
        item.children('media\\:thumbnail').first().attr('url') ||
        extractImage(htmlContent);
    const tags = item.children('category').map((_, cat) => cleanText($(cat).text())).get().filter(Boolean);

    posts.push(createPost(source, title, url, { summary, publishedAt, thumbnail, tags }));
  });

  $('entry').each((_, el) => {
    const entry = $(el);
    const title = cleanText(entry.children('title').first().text());
    const linkEl = entry.children('link[rel="alternate"]').first().length
      ? entry.children('link[rel="alternate"]').first()
      : entry.children('link').first();
    const url = absoluteUrl(linkEl.attr('href') || cleanText(linkEl.text()), source.url);
    if (!title || !url) return;

    const summary = summaryFromHtml(
      entry.children('summary').first().text() ||
      entry.children('content').first().text(),
    );
    const publishedAt = toIsoDate(entry.children('published').first().text() || entry.children('updated').first().text());
    const thumbnail = entry.children('media\\:thumbnail').first().attr('url') || extractImage(entry.children('content').first().text());
    const tags = entry.children('category').map((_, cat) => cleanText($(cat).attr('term') || $(cat).text())).get().filter(Boolean);

    posts.push(createPost(source, title, url, { summary, publishedAt, thumbnail, tags }));
  });

  return posts.slice(0, 20);
}

export function parseHtml(html: string, source: TechBlogSource): TechBlogPost[] {
  const $ = load(html);
  $('script, style, noscript, nav, header, footer, aside').remove();
  const posts: TechBlogPost[] = [];

  const blocks = $('article, li, .post, .entry, [class*="post"], [class*="article"], [class*="card"]').toArray();
  const candidates = blocks.length > 0 ? blocks : $('a[href]').toArray();

  for (const el of candidates) {
    const block = $(el);
    const anchor = block.is('a') ? block : block.find('a[href]').first();
    const rawUrl = anchor.attr('href');
    const url = rawUrl ? absoluteUrl(rawUrl, source.url) : '';
    if (!url || isNoiseUrl(url, source.url)) continue;

    const title = cleanText(
      anchor.find('h1, h2, h3, h4').first().text() ||
      block.find('h1, h2, h3, h4').first().text() ||
      anchor.text(),
    );
    if (!title || title.length < 6 || title.length > 180) continue;

    const summary = cleanText(block.find('p').first().text());
    const publishedAt = toIsoDate(block.find('time').first().attr('datetime') || block.find('time').first().text());
    const thumbnail = absoluteUrl(block.find('img').first().attr('src') || block.find('img').first().attr('data-src') || '', source.url);

    posts.push(createPost(source, title, url, { summary, publishedAt, thumbnail }));
    if (posts.length >= 20) break;
  }

  return dedupePosts(posts);
}

export function createPost(
  source: TechBlogSource,
  title: string,
  url: string,
  extra: Partial<Omit<TechBlogPost, 'id' | 'sourceId' | 'sourceName' | 'title' | 'url'>> = {},
): TechBlogPost {
  return {
    id: `${source.id}:${Buffer.from(url).toString('base64url')}`,
    sourceId: source.id,
    sourceName: source.name,
    title: cleanText(title),
    url,
    summary: extra.summary ? cleanText(extra.summary).slice(0, 240) : undefined,
    publishedAt: extra.publishedAt,
    thumbnail: extra.thumbnail,
    tags: extra.tags ?? [],
  };
}

export function dedupePosts(posts: TechBlogPost[]): TechBlogPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = normalizeUrl(post.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summaryFromHtml(html: string): string | undefined {
  if (!html) return undefined;
  const $ = load(html);
  return cleanText($.text()).slice(0, 240) || undefined;
}

export function extractImage(html: string): string | undefined {
  if (!html) return undefined;
  const $ = load(html);
  return $('img').first().attr('src') || undefined;
}

export function absoluteUrl(url: string, base: string): string {
  const clean = cleanText(url);
  if (!clean || clean.startsWith('mailto:') || clean.startsWith('javascript:')) return '';
  try {
    return new URL(clean, base).toString();
  } catch {
    return '';
  }
}

export function isNoiseUrl(url: string, base: string): boolean {
  try {
    const parsed = new URL(url);
    const baseUrl = new URL(base);
    if (parsed.hostname !== baseUrl.hostname && !baseUrl.hostname.includes('medium.com')) return true;
    return ['#', '/', baseUrl.pathname].includes(parsed.pathname) || /\.(png|jpg|jpeg|gif|svg|webp|pdf)$/i.test(parsed.pathname);
  } catch {
    return true;
  }
}

export function cleanText(value: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function toIsoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function dateValue(value?: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function normalizeUrl(value: string): string {
  return value.replace(/[#?].*$/, '').replace(/\/$/, '');
}
