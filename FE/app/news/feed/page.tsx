"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { getNewsFeed, NEWS_CATEGORY_LABELS, type NewsCategory, type NewsItem } from "@/lib/api/news-feed";

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
      className={`group flex flex-col gap-2 rounded-xl border p-4 transition ${isDark ? "border-white/10 bg-white/5 hover:border-emerald-400/30" : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md"}`}
    >
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
    </a>
  );
}

function Skeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className={`mb-2 h-4 w-20 animate-pulse rounded ${pulse}`} />
      <div className={`mb-1 h-4 w-full animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-4/5 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

const ALL_CATEGORIES = Object.entries(NEWS_CATEGORY_LABELS) as [NewsCategory, string][];

export default function NewsFeedPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [category, setCategory] = useState<NewsCategory>(() => {
    if (typeof window === "undefined") return "it";
    const value = new URLSearchParams(window.location.search).get("category");
    return value && value in NEWS_CATEGORY_LABELS ? (value as NewsCategory) : "it";
  });
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
    try {
      const result = await getNewsFeed(cat);
      setItems(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "뉴스를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setQuery("");
    load(category);
  }, [load, category]);

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

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <section className={`rounded-2xl border p-5 shadow-sm ${panelClass}`}>
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
                className={`h-9 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-emerald-200/50 sm:w-52 ${inputClass}`}
              />
              <button
                onClick={() => load(category, true)}
                disabled={refreshing}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-60 ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-900 text-white hover:bg-emerald-700"}`}
              >
                <IconRefresh spinning={refreshing} />
                새로고침
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[200px_1fr]">
          {/* Sidebar: category list */}
          <aside className={`hidden h-fit rounded-2xl border p-3 shadow-sm lg:block ${panelClass}`}>
            <div className={`px-2 pb-2 text-xs font-semibold ${textSub}`}>카테고리</div>
            <div className="space-y-0.5">
              {ALL_CATEGORIES.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setCategory(id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
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
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    category === id
                      ? isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                      : isDark ? "bg-white/5 text-white/60" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-3 flex items-center justify-between">
              <span className={`text-sm font-medium ${textSub}`}>
                {loading ? "불러오는 중..." : `${filtered.length}개의 기사`}
              </span>
            </div>

            {error && (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${isDark ? "border-red-900/50 bg-red-950/40 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                {error}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} isDark={isDark} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className={`py-16 text-center text-sm ${textSub}`}>
                {query ? `"${query}"에 해당하는 기사가 없습니다.` : "기사가 없습니다."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filtered.map((item, i) => (
                  <NewsCard key={`${item.link}-${i}`} item={item} isDark={isDark} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
