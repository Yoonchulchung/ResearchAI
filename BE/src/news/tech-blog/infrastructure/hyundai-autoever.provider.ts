import { load } from 'cheerio';
import type { TechBlogPost, TechBlogSource } from '../domain/tech-blog.types';
import {
  absoluteUrl,
  cleanText,
  createPost,
  dateValue,
  dedupePosts,
  REQUEST_TIMEOUT_MS,
} from './tech-blog-crawler.util';

const HYUNDAI_AUTOEVER_AJAX_URL = 'https://www.hyundai-autoever.com/kor/about/pr/blog/list.ajax';
const HYUNDAI_AUTOEVER_REFERER = 'https://www.hyundai-autoever.com/kor/about/pr/blog/list.do?';
const MAX_PAGES = 5;

export async function fetchHyundaiAutoeverPosts(source: TechBlogSource): Promise<TechBlogPost[]> {
  const firstPageHtml = await fetchHyundaiAutoeverPage(1);
  const firstPagePosts = parseHyundaiAutoeverHtml(firstPageHtml, source);
  const totalPages = totalPageCount(firstPageHtml);
  const pageCount = Math.min(Math.max(totalPages, 1), MAX_PAGES);

  const rest = await Promise.allSettled(
    Array.from({ length: pageCount - 1 }, (_, index) => fetchHyundaiAutoeverPage(index + 2)),
  );
  const restPosts = rest.flatMap((result) =>
    result.status === 'fulfilled' ? parseHyundaiAutoeverHtml(result.value, source) : [],
  );

  return dedupePosts([...firstPagePosts, ...restPosts])
    .sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
}

async function fetchHyundaiAutoeverPage(pageIndex: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(HYUNDAI_AUTOEVER_AJAX_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'Accept': 'text/html, */*; q=0.01',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://www.hyundai-autoever.com',
        'Referer': HYUNDAI_AUTOEVER_REFERER,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({ pageIndex: String(pageIndex), q: '', f: '1' }).toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseHyundaiAutoeverHtml(html: string, source: TechBlogSource): TechBlogPost[] {
  const $ = load(html);
  const posts: TechBlogPost[] = [];

  $('a.list[href]').each((_, el) => {
    const item = $(el);
    const title = cleanText(item.find('.title').first().text());
    const url = absoluteUrl(item.attr('href') ?? '', source.url);
    if (!title || !url) return;

    const dateText = cleanText(item.find('.date').first().text());
    const publishedAt = toHyundaiAutoeverDate(dateText);
    const thumbnail = absoluteUrl(item.find('img').first().attr('src') ?? '', source.url);

    posts.push(createPost(source, title, url, {
      publishedAt,
      thumbnail,
      tags: [],
    }));
  });

  return posts;
}

function totalPageCount(html: string): number {
  const $ = load(html);
  const value = $('a.list').first().attr('data-total-page-count');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

function toHyundaiAutoeverDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value.replace(/\./g, '-'));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
