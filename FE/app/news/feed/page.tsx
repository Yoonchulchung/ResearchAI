"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { getNewsFeed, getYoutubeNews, NEWS_CATEGORY_LABELS, type NewsCategory, type NewsItem, type YoutubeNewsItem } from "@/lib/api/news-feed";
import { groupNewsByDailyTopic, type DailyNewsTopicGroup } from "../_lib/news-topic-groups";

function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-0 transition-opacity group-hover:opacity-100">
      <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return `${diff}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function NewsCard({ item, isDark }: { item: NewsItem; isDark: boolean }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className={`group flex flex-col overflow-hidden rounded-md border transition ${isDark ? "border-white/10 bg-white/5 hover:border-emerald-400/30" : "border-slate-200 bg-white hover:border-emerald-300"}`}
    >
      {item.imageUrl && (
        <div className="aspect-2/1 w-full overflow-hidden bg-slate-100">
          <img
            src={item.imageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>{item.source}</span>
          {item.pubDate && <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(item.pubDate)}</span>}
          <IconExternal />
        </div>
        <h2 className={`text-sm font-semibold leading-snug ${isDark ? "text-white group-hover:text-emerald-300" : "text-slate-900 group-hover:text-emerald-700"}`}>
          {stripHtml(item.title)}
        </h2>
        {item.description && (
          <p className={`line-clamp-3 text-xs leading-5 ${isDark ? "text-white/45" : "text-slate-500"}`}>
            {stripHtml(item.description)}
          </p>
        )}
      </div>
    </a>
  );
}

function YoutubeCard({ item, isDark }: { item: YoutubeNewsItem; isDark: boolean }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={`group flex flex-col overflow-hidden rounded-md border transition ${isDark ? "border-white/10 bg-white/5 hover:border-red-400/30" : "border-slate-200 bg-white hover:border-red-300"}`}>
      <div className="relative aspect-video w-full cursor-pointer overflow-hidden bg-black" onClick={() => setPlaying(true)}>
        {playing ? (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${item.videoId}?autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-800">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="#FF0000"/><polygon points="16,13 30,20 16,27" fill="white"/></svg>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 shadow-lg transition group-hover:bg-red-500 group-hover:scale-110">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><polygon points="7,4 17,10 7,16" fill="white"/></svg>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isDark ? "bg-red-500/15 text-red-300" : "bg-red-50 text-red-700"}`}>{item.source}</span>
          {item.pubDate && <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(item.pubDate)}</span>}
        </div>
        <a href={item.link} target="_blank" rel="noreferrer" className={`text-sm font-semibold leading-snug line-clamp-2 ${isDark ? "text-white/90 hover:text-red-300" : "text-slate-900 hover:text-red-700"}`}>
          {item.title}
        </a>
        {item.description && (
          <p className={`line-clamp-2 text-xs leading-5 ${isDark ? "text-white/40" : "text-slate-500"}`}>
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

function TopicGroupCard({
  group,
  isDark,
}: {
  group: DailyNewsTopicGroup;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? group.items : group.items.slice(0, 3);
  const groupDate = formatDate(group.dateKey) || group.dateKey;

  return (
    <section
      className={`overflow-hidden rounded-md border xl:col-span-2 ${
        isDark ? "border-emerald-400/20 bg-white/[0.035]" : "border-emerald-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
          isDark ? "hover:bg-white/5" : "hover:bg-emerald-50/60"
        }`}
      >
        <span
          className={`rounded-md px-2.5 py-1 text-sm font-black ${
            isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {group.keyword}
        </span>
        <span className={`text-xs font-semibold ${isDark ? "text-white/45" : "text-slate-500"}`}>
          {groupDate} · 관련 기사 {group.items.length}건
        </span>
        <span
          className={`ml-auto text-xs transition-transform ${
            expanded ? "rotate-180" : ""
          } ${isDark ? "text-white/35" : "text-slate-400"}`}
        >
          ▼
        </span>
      </button>
      <div className={isDark ? "border-t border-white/5" : "border-t border-slate-100"}>
        {visibleItems.map((item, index) => (
          <a
            key={item.link}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className={`group flex items-start gap-3 px-4 py-3 transition ${
              index > 0 ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""
            } ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
          >
            <span
              className={`mt-0.5 w-24 shrink-0 truncate text-xs font-semibold ${
                isDark ? "text-emerald-400" : "text-emerald-600"
              }`}
            >
              {item.source}
            </span>
            <span
              className={`min-w-0 flex-1 text-sm font-semibold leading-snug ${
                isDark
                  ? "text-white/85 group-hover:text-emerald-300"
                  : "text-slate-800 group-hover:text-emerald-700"
              }`}
            >
              {stripHtml(item.title)}
            </span>
            <IconExternal />
          </a>
        ))}
        {!expanded && group.items.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`w-full border-t px-4 py-2 text-xs font-semibold ${
              isDark
                ? "border-white/5 text-white/40 hover:bg-white/5"
                : "border-slate-100 text-slate-400 hover:bg-slate-50"
            }`}
          >
            {group.items.length - 3}건 더 보기
          </button>
        )}
      </div>
    </section>
  );
}

function Skeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`rounded-md border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className={`mb-2 h-4 w-20 animate-pulse rounded ${pulse}`} />
      <div className={`mb-1 h-4 w-full animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-4/5 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

const ALL_CATEGORIES = Object.entries(NEWS_CATEGORY_LABELS) as [NewsCategory, string][];
const PAGE_SIZE = 30;
const PAGED_CATEGORIES = new Set<NewsCategory>(["it", "economy", "society", "politics", "world", "culture", "science"]);

function mergeItems(current: NewsItem[], next: NewsItem[]) {
  const seen = new Set(current.map((item) => item.link));
  const merged = [...current];
  for (const item of next) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    merged.push(item);
  }
  return merged;
}

export default function NewsFeedPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [category, setCategory] = useState<NewsCategory>(() => {
    if (typeof window === "undefined") return "it";
    const value = new URLSearchParams(window.location.search).get("category");
    return value && value in NEWS_CATEGORY_LABELS ? (value as NewsCategory) : "it";
  });
  const [items, setItems] = useState<NewsItem[]>([]);
  const [youtubeItems, setYoutubeItems] = useState<YoutubeNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [groupTopics, setGroupTopics] = useState(true);

  const pageClass = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const inputClass = isDark
    ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-emerald-400/50"
    : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-emerald-300";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  const load = useCallback(async (cat: NewsCategory, force = false) => {
    setError(null);
    if (force) setRefreshing(true);
    else setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    try {
      if (cat === "youtube") {
        const result = await getYoutubeNews(30);
        setYoutubeItems(result);
        setItems([]);
      } else {
        const result = await getNewsFeed(cat, { limit: PAGE_SIZE, offset: 0 });
        setItems(result);
        setYoutubeItems([]);
        setHasMore(PAGED_CATEGORIES.has(cat) && result.length >= PAGE_SIZE);
        setNextOffset(PAGE_SIZE);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "뉴스를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(category); }, [load, category]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || refreshing || !hasMore || query.trim()) return;
    setLoadingMore(true);
    setError(null);
    try {
      const offset = nextOffset;
      const result = await getNewsFeed(category, { limit: PAGE_SIZE, offset });
      setItems((current) => mergeItems(current, result));
      setHasMore(PAGED_CATEGORIES.has(category) && result.length >= PAGE_SIZE);
      setNextOffset(offset + PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "뉴스를 더 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  }, [category, hasMore, loading, loadingMore, nextOffset, query, refreshing]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || query.trim()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "360px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore, query]);

  const filtered = query.trim()
    ? items.filter((item) => {
        const q = query.trim().toLowerCase();
        return (
          stripHtml(item.title).toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q) ||
          (item.description ? stripHtml(item.description).toLowerCase().includes(q) : false)
        );
      })
    : items;
  const topicGroups = useMemo(
    () => groupNewsByDailyTopic(filtered),
    [filtered],
  );
  const groupedTopicCount = topicGroups.filter(
    (group) => group.keyword !== null,
  ).length;

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <section className={`rounded-md border p-5 ${panelClass}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <button
                onClick={() => router.push("/news")}
                className={`mb-2 text-sm font-semibold ${isDark ? "text-white/45 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
              >
                ← 뉴스
              </button>
              <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>뉴스 피드</h1>
              <p className={`mt-1 text-sm ${textSub}`}>네이버 뉴스 기반으로 주요 카테고리의 최신 기사를 모아봅니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목, 출처 검색"
                className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition focus:ring-2 focus:ring-emerald-200/50 sm:w-52 ${inputClass}`}
              />
              <button
                onClick={() => load(category, true)}
                disabled={refreshing}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition disabled:opacity-60 ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-900 text-white hover:bg-emerald-700"}`}
              >
                <IconRefresh spinning={refreshing} />
                새로고침
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[200px_1fr]">
          {/* Sidebar: category list */}
          <aside className={`hidden h-fit rounded-md border p-3 lg:block ${panelClass}`}>
            <div className={`px-2 pb-2 text-xs font-semibold ${textSub}`}>카테고리</div>
            <div className="space-y-0.5">
              {ALL_CATEGORIES.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setCategory(id)}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition ${
                    category === id
                      ? isDark ? "bg-emerald-500/15 font-semibold text-emerald-300" : "bg-emerald-50 font-semibold text-emerald-700"
                      : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0">
            {/* Mobile category tabs */}
            <div className={`mb-3 flex flex-wrap gap-1.5 lg:hidden`}>
              {ALL_CATEGORIES.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setCategory(id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    category === id
                      ? isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                      : isDark ? "bg-white/5 text-white/60" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <span className={`text-sm font-medium ${textSub}`}>
                {loading
                  ? "불러오는 중..."
                  : category === "youtube"
                    ? `${youtubeItems.length}개의 영상`
                    : groupTopics && groupedTopicCount > 0
                      ? `${filtered.length}개 기사 · ${groupedTopicCount}개 주제`
                      : `${filtered.length}개의 기사`}
              </span>
              {category !== "youtube" && (
                <label
                  className={`flex cursor-pointer items-center gap-2 text-sm font-semibold ${
                    isDark ? "text-white/55" : "text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={groupTopics}
                    onChange={(event) => setGroupTopics(event.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  동일 주제 묶기
                </label>
              )}
            </div>

            {error && (
              <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${isDark ? "border-red-900/50 bg-red-950/40 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                {error}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} isDark={isDark} />)}
              </div>
            ) : category === "youtube" ? (
              youtubeItems.length === 0 ? (
                <div className={`py-16 text-center text-sm ${textSub}`}>YouTube 뉴스를 가져오지 못했습니다.</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {youtubeItems
                    .filter((item) => {
                      if (!query.trim()) return true;
                      const q = query.trim().toLowerCase();
                      return item.title.toLowerCase().includes(q) || item.source.toLowerCase().includes(q);
                    })
                    .map((item) => (
                      <YoutubeCard key={item.videoId} item={item} isDark={isDark} />
                    ))}
                </div>
              )
            ) : filtered.length === 0 ? (
              <div className={`py-16 text-center text-sm ${textSub}`}>
                {query ? `"${query}"에 해당하는 기사가 없습니다.` : "기사가 없습니다."}
              </div>
            ) : groupTopics ? (
              <div className="space-y-5">
                {[...new Set(topicGroups.map((group) => group.dateKey))].map((day) => {
                  const dayGroups = topicGroups.filter((group) => group.dateKey === day);
                  return (
                    <section key={day}>
                      <div className="mb-2 flex items-center gap-3">
                        <span className={`text-xs font-black ${textSub}`}>{day}</span>
                        <div className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {dayGroups.map((group) =>
                          group.keyword ? (
                            <TopicGroupCard key={group.id} group={group} isDark={isDark} />
                          ) : (
                            <NewsCard key={group.id} item={group.items[0]} isDark={isDark} />
                          ),
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filtered.map((item, i) => (
                  <NewsCard key={`${item.link}-${i}`} item={item} isDark={isDark} />
                ))}
              </div>
            )}

            {category !== "youtube" && (
              <div ref={loadMoreRef} className="min-h-8">
                {!loading && !query.trim() && filtered.length > 0 ? (
                  <p className={`py-5 text-center text-xs ${textSub}`}>
                    {loadingMore
                      ? "다음 뉴스를 불러오는 중..."
                      : hasMore
                        ? "아래로 스크롤하면 뉴스를 더 가져옵니다."
                        : "더 가져올 뉴스가 없습니다."}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
