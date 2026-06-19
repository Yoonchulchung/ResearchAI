import { apiFetch } from "./base";

export type NewsCategory = "it" | "economy" | "society" | "politics" | "world" | "culture" | "science" | "github" | "huggingface";

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
};

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description?: string;
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
  const qs = new URLSearchParams({
    category,
    limit: String(options?.limit ?? 20),
    offset: String(offset),
  });
  return apiFetch<NewsItem[]>(`/news/naver?${qs.toString()}`);
}

export function getGithubTrending(since: "daily" | "weekly" | "monthly" = "daily"): Promise<GithubTrendingRepo[]> {
  return apiFetch<GithubTrendingRepo[]>(`/news/github?since=${since}`);
}

export function getHuggingFaceTrending(category: "models" | "datasets" | "spaces" = "models"): Promise<HuggingFaceTrendingItem[]> {
  return apiFetch<HuggingFaceTrendingItem[]>(`/news/huggingface?category=${category}`);
}
