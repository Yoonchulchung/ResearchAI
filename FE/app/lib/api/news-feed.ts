import { apiFetch, API_BASE } from "./base";

export type NewsCategory = "it" | "economy" | "society" | "politics" | "world" | "culture" | "science" | "github" | "huggingface" | "youtube";

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  it: "IT/기술",
  economy: "경제",
  society: "사회",
  politics: "정치",
  world: "세계",
  culture: "문화",
  science: "과학",
  github: "GitHub",
  huggingface: "Hugging Face",
  youtube: "YouTube 뉴스",
};

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description?: string;
  imageUrl?: string | null;
}

export interface GithubTrendingRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
}

export interface HuggingFaceTrendingItem {
  id: string;
  modelId?: string;
  likes: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
  lastModified?: string;
}

export interface YoutubeNewsItem {
  videoId: string;
  title: string;
  link: string;
  source: string;
  channelId: string;
  pubDate: string;
  thumbnailUrl: string;
  description: string;
  isLive?: boolean;
  viewCount?: number;
}

export function getNewsFeed(
  category: NewsCategory = "it",
  options?: { limit?: number; offset?: number },
): Promise<NewsItem[]> {
  const offset = options?.offset ?? 0;
  if (category === "github") {
    if (offset > 0) return Promise.resolve([]);
    return getGithubTrending("daily").then((items) =>
      items.map((item) => ({
        title: item.full_name,
        link: item.html_url,
        source: item.language ? `GitHub · ${item.language}` : "GitHub",
        pubDate: "",
        description: item.description ?? `Stars ${item.stargazers_count.toLocaleString()} · Forks ${item.forks_count.toLocaleString()}`,
      })),
    );
  }
  if (category === "huggingface") {
    if (offset > 0) return Promise.resolve([]);
    return getHuggingFaceTrending("models").then((items) =>
      items.map((item) => {
        const name = item.id ?? item.modelId ?? "";
        return {
          title: name,
          link: `https://huggingface.co/${name}`,
          source: item.pipeline_tag ? `Hugging Face · ${item.pipeline_tag}` : "Hugging Face",
          pubDate: item.lastModified ?? "",
          description: `Likes ${item.likes.toLocaleString()}${typeof item.downloads === "number" ? ` · Downloads ${item.downloads.toLocaleString()}` : ""}`,
        };
      }),
    );
  }
  if (category === "youtube") {
    if (offset > 0) return Promise.resolve([]);
    return getYoutubeNews(options?.limit ?? 30).then((items) =>
      items.map((item) => ({
        title: item.title,
        link: item.link,
        source: item.source,
        pubDate: item.pubDate,
        description: item.description,
      })),
    );
  }
  const qs = new URLSearchParams({
    category,
    limit: String(options?.limit ?? 20),
    offset: String(offset),
  });
  return apiFetch<NewsItem[]>(`/news/naver?${qs.toString()}`);
}

export function getYoutubeNews(limit = 30): Promise<YoutubeNewsItem[]> {
  return apiFetch<YoutubeNewsItem[]>(`/news/youtube?limit=${limit}`);
}

export function getYoutubeLive(): Promise<YoutubeNewsItem[]> {
  return apiFetch<YoutubeNewsItem[]>(`/news/youtube?type=live`);
}

export interface SearchRoadmapEvent {
  category: string;
  summary: string;
  type: string;
  importance: string;
  sourceIndex?: number;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface SearchRoadmapMonth {
  yearMonth: string;
  events: SearchRoadmapEvent[];
}

export interface SearchRoadmapResult {
  months: SearchRoadmapMonth[];
  newsCount: number;
  query: string;
  model: string;
}

export function getSearchRoadmap(q: string): Promise<SearchRoadmapResult> {
  return apiFetch<SearchRoadmapResult>(`/news/search-roadmap?q=${encodeURIComponent(q)}`);
}

export interface QueryNewsItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
  imageUrl?: string;
  source: string;
  itemType?: 'news' | 'web';
}

export interface QueryNewsResult {
  items: QueryNewsItem[];
  hasMore: boolean;
  nextStart: number;
}

export interface WebSearchItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export function getWebSearch(q: string, limit = 10): Promise<WebSearchItem[]> {
  return apiFetch<WebSearchItem[]>(`/news/web-search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function getQueryNews(
  q: string,
  start = 1,
  dateFrom?: string,
  dateTo?: string,
): Promise<QueryNewsResult> {
  const qs = new URLSearchParams({ q, start: String(start) });
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo) qs.set('dateTo', dateTo);
  return apiFetch<QueryNewsResult>(`/news/query-news?${qs.toString()}`);
}

export interface RoadmapExpandResult {
  months: SearchRoadmapMonth[];
  newsCount: number;
  query: string;
  model: string;
  addedCount: number;
}

export function expandRoadmap(body: {
  q: string;
  direction: 'newer' | 'older';
  refDate: string;
  existingMonths: SearchRoadmapMonth[];
}): Promise<RoadmapExpandResult> {
  return apiFetch<RoadmapExpandResult>('/news/roadmap-expand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function createSearchAnswerSSE(
  q: string,
  dateFrom?: string,
  dateTo?: string,
): EventSource {
  const qs = new URLSearchParams({ q });
  if (dateFrom) qs.set("dateFrom", dateFrom);
  if (dateTo) qs.set("dateTo", dateTo);
  return new EventSource(`${API_BASE}/news/search-answer?${qs.toString()}`);
}

export function getGithubTrending(since: "daily" | "weekly" | "monthly" = "daily"): Promise<GithubTrendingRepo[]> {
  return apiFetch<GithubTrendingRepo[]>(`/news/github?since=${since}`);
}

export function getHuggingFaceTrending(category: "models" | "datasets" | "spaces" = "models"): Promise<HuggingFaceTrendingItem[]> {
  return apiFetch<HuggingFaceTrendingItem[]>(`/news/huggingface?category=${category}`);
}
