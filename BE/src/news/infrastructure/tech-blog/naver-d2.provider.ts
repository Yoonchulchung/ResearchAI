import type {
  TechBlogPost,
  TechBlogSource,
} from 'src/news/domain/tech-blog/tech-blog.types';
import {
  absoluteUrl,
  cleanText,
  createPost,
  REQUEST_TIMEOUT_MS,
  summaryFromHtml,
} from 'src/news/infrastructure/tech-blog/tech-blog-crawler.util';

const NAVER_D2_CONTENTS_API =
  'https://d2.naver.com/api/v1/contents?categoryId=&page=0&size=20';

export async function fetchNaverD2Posts(
  source: TechBlogSource,
): Promise<TechBlogPost[]> {
  const json = await fetchNaverD2Json();
  const data = JSON.parse(json) as {
    content?: Array<{
      postTitle?: string;
      postImage?: string;
      postHtml?: string;
      postPublishedAt?: number;
      url?: string;
    }>;
  };

  return (data.content ?? [])
    .map((item): TechBlogPost | null => {
      const title = cleanText(item.postTitle ?? '');
      const url = absoluteUrl(item.url ?? '', source.url);
      if (!title || !url) return null;

      const publishedAt =
        typeof item.postPublishedAt === 'number'
          ? new Date(item.postPublishedAt).toISOString()
          : undefined;
      const thumbnail = item.postImage
        ? absoluteUrl(item.postImage, source.url)
        : undefined;
      const summary = summaryFromHtml(item.postHtml ?? '');

      return createPost(source, title, url, {
        summary,
        publishedAt,
        thumbnail,
      });
    })
    .filter((post): post is TechBlogPost => post !== null);
}

async function fetchNaverD2Json(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(NAVER_D2_CONTENTS_API, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}
