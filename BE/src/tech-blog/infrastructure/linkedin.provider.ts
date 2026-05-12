import { load } from 'cheerio';
import type { TechBlogPost, TechBlogSource } from '../domain/tech-blog.types';
import {
  absoluteUrl,
  cleanText,
  createPost,
  dateValue,
  dedupePosts,
  REQUEST_TIMEOUT_MS,
  toIsoDate,
} from './tech-blog-crawler.util';

export async function fetchLinkedInPosts(source: TechBlogSource): Promise<TechBlogPost[]> {
  const html = await fetchLinkedInHtml(source.url);
  const posts = [
    ...parseFeaturedPost(html, source),
    ...parseGridPosts(html, source),
  ];

  return dedupePosts(posts)
    .sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt))
    .slice(0, 20);
}

async function fetchLinkedInHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeaturedPost(html: string, source: TechBlogSource): TechBlogPost[] {
  const $ = load(html);
  const posts: TechBlogPost[] = [];

  $('.featured-post').each((_, el) => {
    const item = $(el);
    const titleAnchor = item.find('.featured-post__headline[href]').first();
    const title = cleanText(titleAnchor.text());
    const url = absoluteUrl(titleAnchor.attr('href') ?? '', source.url);
    if (!title || !url) return;

    const summary = cleanText(item.find('.featured-post__description').first().text());
    const tag = cleanText(item.find('.featured-post__topic').first().text());
    const thumbnail = imageUrl($, item, source.url);

    posts.push(createPost(source, title, url, {
      summary,
      thumbnail,
      tags: tag ? [tag] : [],
    }));
  });

  return posts;
}

function parseGridPosts(html: string, source: TechBlogSource): TechBlogPost[] {
  const $ = load(html);
  const posts: TechBlogPost[] = [];

  $('.post-list__item.grid-post, .grid-post').each((_, el) => {
    const item = $(el);
    const titleAnchor = item.find('.grid-post__title .grid-post__link[href], .grid-post__link[href]').first();
    const title = cleanText(titleAnchor.text());
    const url = absoluteUrl(titleAnchor.attr('href') ?? '', source.url);
    if (!title || !url) return;

    const publishedAt = toIsoDate(item.find('.grid-post__date').first().text());
    const tag = cleanText(item.find('.grid-post__topic').first().text());
    const thumbnail = imageUrl($, item, source.url);

    posts.push(createPost(source, title, url, {
      publishedAt,
      thumbnail,
      tags: tag ? [tag] : [],
    }));
  });

  return posts;
}

function imageUrl($: ReturnType<typeof load>, item: ReturnType<ReturnType<typeof load>>, baseUrl: string): string | undefined {
  const image = item.find('img.post__image, img').first();
  const fromSrcset = firstSrcsetUrl(image.attr('srcset') ?? '');
  const url = absoluteUrl(
    image.attr('src') ||
    image.attr('data-delayed-url') ||
    fromSrcset ||
    '',
    baseUrl,
  );
  return url || undefined;
}

function firstSrcsetUrl(value: string): string {
  return cleanText(value.split(',')[0]?.trim().split(/\s+/)[0] ?? '');
}
