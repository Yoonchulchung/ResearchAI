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
  parseFeed,
  REQUEST_TIMEOUT_MS,
} from 'src/news/infrastructure/tech-blog/tech-blog-crawler.util';

const MEDIUM_GRAPHQL_URL = 'https://medium.com/_/graphql';

export async function fetchNaverPlacePosts(
  source: TechBlogSource,
): Promise<TechBlogPost[]> {
  const body = process.env.MEDIUM_NAVER_PLACE_GRAPHQL_BODY;
  if (body) {
    try {
      const json = await fetchMediumGraphql(body);
      const posts = extractMediumPosts(json, source).slice(0, 20);
      if (posts.length > 0) return posts;
    } catch {
      // Medium GraphQL is fragile because it depends on browser-session payloads.
      // Fall back to RSS so the source still works without a captured request body.
    }
  }

  return fetchMediumFeedPosts(source);
}

async function fetchMediumFeedPosts(
  source: TechBlogSource,
): Promise<TechBlogPost[]> {
  if (!source.feedUrl) return [];
  const xml = await fetchMediumFeedText(source.feedUrl);
  return parseFeed(xml, source);
}

async function fetchMediumFeedText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMediumGraphql(body: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(MEDIUM_GRAPHQL_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        'apollographql-client-name': 'lite',
        'apollographql-client-version':
          process.env.MEDIUM_GRAPHQL_CLIENT_VERSION ??
          'main-20260511-233840-21f94d57d2',
        'graphql-operation': 'PublicationSectionPostsQuery',
        'medium-frontend-app':
          process.env.MEDIUM_FRONTEND_APP ??
          'lite/main-20260511-233840-21f94d57d2',
        'medium-frontend-path': '/naver-place-dev',
        'medium-frontend-route': 'collection-homepage',
        origin: 'https://medium.com',
        referer: 'https://medium.com/naver-place-dev',
        ...(process.env.MEDIUM_GRAPHQL_COOKIE
          ? { cookie: process.env.MEDIUM_GRAPHQL_COOKIE }
          : {}),
      },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(stripMediumJsonPrefix(await res.text()));
  } finally {
    clearTimeout(timeout);
  }
}

function extractMediumPosts(
  value: unknown,
  source: TechBlogSource,
): TechBlogPost[] {
  const posts: TechBlogPost[] = [];
  const seenObjects = new WeakSet<object>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (seenObjects.has(node)) return;
    seenObjects.add(node);

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const record = node as Record<string, unknown>;
    const post = mediumRecordToPost(record, source);
    if (post) posts.push(post);

    Object.values(record).forEach(visit);
  };

  visit(value);
  return dedupePosts(posts).sort(
    (a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt),
  );
}

function mediumRecordToPost(
  record: Record<string, unknown>,
  source: TechBlogSource,
): TechBlogPost | null {
  const title = cleanText(stringValue(record.title));
  if (!title) return null;

  const url = mediumPostUrl(record, source);
  if (!url) return null;

  const publishedAt = mediumPublishedAt(record);
  const summary = cleanText(
    stringValue(record.subtitle) ||
      stringValue(record.description) ||
      stringValue(objectValue(record.previewContent).subtitle) ||
      stringValue(objectValue(record.extendedPreviewContent).subtitle),
  );
  const thumbnail = mediumImageUrl(record);
  const tags = mediumTags(record);

  return createPost(source, title, url, {
    summary,
    publishedAt,
    thumbnail,
    tags,
  });
}

function mediumPostUrl(
  record: Record<string, unknown>,
  source: TechBlogSource,
): string {
  const directUrl =
    stringValue(record.mediumUrl) ||
    stringValue(record.canonicalUrl) ||
    stringValue(objectValue(record.previewContent).mediumUrl);
  if (directUrl) return absoluteUrl(directUrl, source.url);

  const uniqueSlug = stringValue(record.uniqueSlug);
  const id = stringValue(record.id);
  if (uniqueSlug && id) {
    const suffix = uniqueSlug.endsWith(id) ? uniqueSlug : `${uniqueSlug}-${id}`;
    return `https://medium.com/naver-place-dev/${suffix}`;
  }

  return '';
}

function mediumPublishedAt(
  record: Record<string, unknown>,
): string | undefined {
  const raw =
    record.firstPublishedAt ??
    record.latestPublishedAt ??
    record.createdAt ??
    record.updatedAt;
  if (typeof raw === 'number') return new Date(raw).toISOString();
  if (typeof raw === 'string') {
    const numeric = Number(raw);
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

function mediumImageUrl(record: Record<string, unknown>): string | undefined {
  const imageId =
    stringValue(objectValue(record.previewImage).id) ||
    stringValue(
      objectValue(objectValue(record.virtuals).previewImage).imageId,
    ) ||
    stringValue(objectValue(objectValue(record.virtuals).previewImage).id) ||
    stringValue(record.imageId);
  if (imageId) return `https://miro.medium.com/v2/resize:fit:720/${imageId}`;
  return undefined;
}

function mediumTags(record: Record<string, unknown>): string[] {
  const tags = record.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (typeof tag === 'string') return tag;
      if (!tag || typeof tag !== 'object') return '';
      const item = tag as Record<string, unknown>;
      return (
        stringValue(item.displayTitle) ||
        stringValue(item.name) ||
        stringValue(item.slug)
      );
    })
    .map((tag) => cleanText(tag))
    .filter(Boolean);
}

function stripMediumJsonPrefix(value: string): string {
  return value.replace(/^\]\}\)while\(1\);<\/x>/, '').trim();
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
