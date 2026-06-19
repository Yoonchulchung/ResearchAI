import { load } from 'cheerio';
import type { TechBlogPost, TechBlogSource } from 'src/news/tech-blog/domain/tech-blog.types';
import {
  absoluteUrl,
  cleanText,
  createPost,
  dedupePosts,
  fetchText,
  normalizeUrl,
  parseFeed,
} from 'src/news/tech-blog/infrastructure/tech-blog-crawler.util';

export async function fetchBanksaladPosts(
  source: TechBlogSource,
): Promise<TechBlogPost[]> {
  const [htmlResult, feedResult] = await Promise.allSettled([
    fetchText(source.url),
    source.feedUrl ? fetchText(source.feedUrl) : Promise.resolve(''),
  ]);
  const html = htmlResult.status === 'fulfilled' ? htmlResult.value : '';
  const feed = feedResult.status === 'fulfilled' ? feedResult.value : '';
  const feedPosts = feed ? parseFeed(feed, source) : [];
  const feedByUrl = new Map(
    feedPosts.map((post) => [normalizeUrl(post.url), post]),
  );
  const parsed = html ? parseBanksaladHtml(html, source, feedByUrl) : [];

  if (parsed.length > 0) return dedupePosts([...parsed, ...feedPosts]);
  if (feedPosts.length > 0) return feedPosts;

  if (htmlResult.status === 'rejected') throw htmlResult.reason;
  if (feedResult.status === 'rejected') throw feedResult.reason;
  return [];
}

function parseBanksaladHtml(
  html: string,
  source: TechBlogSource,
  feedByUrl: Map<string, TechBlogPost> = new Map(),
): TechBlogPost[] {
  const $ = load(html);
  const posts: TechBlogPost[] = [];

  $('.post_card').each((_, el) => {
    if (posts.length >= 20) return false;

    const card = $(el);
    const titleAnchor = card.find('.post_title a[href]').first();
    const title = cleanText(titleAnchor.text());
    const url = absoluteUrl(titleAnchor.attr('href') ?? '', source.url);
    if (!title || !url) return;

    const feedPost = feedByUrl.get(normalizeUrl(url));
    const summary = cleanText(card.find('.excerpt').first().text());
    const thumbnail = absoluteUrl(
      card
        .find('.post_preview img[data-main-image]')
        .first()
        .attr('data-src') ||
        card.find('.post_preview img[data-main-image]').first().attr('src') ||
        card.find('.post_preview img').first().attr('data-src') ||
        card.find('.post_preview img').first().attr('src') ||
        '',
      source.url,
    );
    const tags = card
      .find('.post_tags a')
      .map((_, tag) => cleanText($(tag).text()).replace(/^#/, ''))
      .get()
      .filter(Boolean);

    posts.push(
      createPost(source, title, url, {
        summary: summary || feedPost?.summary,
        publishedAt: feedPost?.publishedAt,
        thumbnail: thumbnail || feedPost?.thumbnail,
        tags: tags.length > 0 ? tags : feedPost?.tags,
      }),
    );
  });

  return dedupePosts(posts);
}
