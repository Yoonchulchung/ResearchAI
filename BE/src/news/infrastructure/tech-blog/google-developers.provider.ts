import { load } from 'cheerio';
import type {
  TechBlogPost,
  TechBlogSource,
} from 'src/news/domain/tech-blog/tech-blog.types';
import {
  absoluteUrl,
  cleanText,
  createPost,
  dateValue,
  dedupePosts,
  fetchText,
  toIsoDate,
} from 'src/news/infrastructure/tech-blog/tech-blog-crawler.util';

const GOOGLE_DEVELOPERS_CATEGORY_URLS = [
  'https://developers.googleblog.com/search/?technology_categories=AI',
  'https://developers.googleblog.com/search/?technology_categories=Mobile',
  'https://developers.googleblog.com/search/?technology_categories=Web',
  'https://developers.googleblog.com/search/?technology_categories=Cloud',
];

export async function fetchGoogleDevelopersPosts(
  source: TechBlogSource,
): Promise<TechBlogPost[]> {
  const settled = await Promise.allSettled(
    GOOGLE_DEVELOPERS_CATEGORY_URLS.map((url) =>
      fetchGoogleDevelopersCategory(source, url),
    ),
  );
  const posts = settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );

  if (posts.length === 0) {
    const firstError = settled.find((result) => result.status === 'rejected');
    if (firstError?.status === 'rejected') throw firstError.reason;
  }

  return dedupePosts(posts).sort(
    (a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt),
  );
}

async function fetchGoogleDevelopersCategory(
  source: TechBlogSource,
  categoryUrl: string,
): Promise<TechBlogPost[]> {
  const html = await fetchText(categoryUrl);
  const $ = load(html);
  const posts: TechBlogPost[] = [];

  $('.search-result').each((_, el) => {
    const result = $(el);
    const titleAnchor = result.find('.search-result__title a[href]').first();
    const title = cleanText(titleAnchor.text());
    const url = absoluteUrl(titleAnchor.attr('href') ?? '', categoryUrl);
    if (!title || !url) return;

    const eyebrow = parseGoogleDevelopersEyebrow(
      result.find('.search-result__eyebrow').first().text(),
    );
    const summary = cleanText(
      result.find('.search-result__summary').first().text(),
    );
    const thumbnail = absoluteUrl(
      result.find('.search-result__featured-img').first().attr('src') ?? '',
      categoryUrl,
    );

    posts.push(
      createPost(source, title, url, {
        summary,
        publishedAt: eyebrow.publishedAt,
        thumbnail,
        tags: eyebrow.tag ? [eyebrow.tag] : [],
      }),
    );
  });

  return posts;
}

function parseGoogleDevelopersEyebrow(value: string): {
  publishedAt?: string;
  tag?: string;
} {
  const [datePart, tagPart] = cleanText(value)
    .split('/')
    .map((part) => cleanText(part));
  return {
    publishedAt: toIsoDate(datePart),
    tag: tagPart,
  };
}
