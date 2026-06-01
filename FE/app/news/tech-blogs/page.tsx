"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/contexts/ThemeContext";
import {
  cancelTechBlogTrend,
  enqueueTechBlogTrend,
  getLatestTechBlogTrendSummary,
  listTechBlogPosts,
  markTechBlogRead,
  subscribeTechBlogTrend,
  type TechBlogListResult,
  type TechBlogPost,
  type TechBlogTrendSummary,
  updateTechBlogBookmark,
} from "@/lib/api/tech-blogs";

const SOURCE_ALL = "all";

function getInitialSearchParam(name: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M6 4H4C3.45 4 3 4.45 3 5V12C3 12.55 3.45 13 4 13H11C11.55 13 12 12.55 12 12V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 3H13V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSparkles({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.2 9.4L3.8 11L5.4 11.6L3.8 12.2L3.2 13.8L2.6 12.2L1 11.6L2.6 11L3.2 9.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function IconBookmark({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"}>
      <path d="M4.5 2.5h7v11L8 11.2l-3.5 2.3v-11Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return `${diff}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function BlogCard({
  post,
  isDark,
  onToggleBookmark,
  onMarkRead,
}: {
  post: TechBlogPost;
  isDark: boolean;
  onToggleBookmark: (post: TechBlogPost) => void;
  onMarkRead: (post: TechBlogPost) => void;
}) {
  const tags = Array.from(new Set(post.tags)).slice(0, 4);
  const read = Boolean(post.readAt);
  return (
    <article className={`group flex h-full min-h-[14rem] flex-col rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 ${read ? "opacity-65" : ""} ${isDark ? read ? "border-white/5 bg-white/[0.025] hover:border-indigo-400/20" : "border-white/10 bg-white/5 hover:border-indigo-400/30" : read ? "border-slate-200 bg-slate-50 hover:border-indigo-100" : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-2xs font-semibold ${isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"}`}>{post.sourceName}</span>
            <span className={`text-2xs ${isDark ? "text-white/35" : "text-slate-400"}`}>{formatDate(post.publishedAt)}</span>
            {read && <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-white/5 text-white/35" : "bg-slate-200 text-slate-500"}`}>읽음</span>}
          </div>
          <a href={post.url} target="_blank" rel="noreferrer" onClick={() => onMarkRead(post)} className={`line-clamp-2 text-base font-semibold leading-snug transition-colors ${isDark ? "text-white hover:text-indigo-300" : "text-slate-900 hover:text-indigo-600"}`}>
            {post.title}
          </a>
        </div>
        <button
          type="button"
          onClick={() => onToggleBookmark(post)}
          className={`shrink-0 rounded-lg border p-2 transition ${post.bookmarked ? isDark ? "border-amber-300/30 bg-amber-400/15 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-600" : isDark ? "border-white/10 text-white/45 hover:bg-white/10 hover:text-white" : "border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"}`}
          aria-label={post.bookmarked ? "북마크 해제" : "북마크"}
        >
          <IconBookmark filled={post.bookmarked} />
        </button>
        {post.thumbnail && (
          <a href={post.url} target="_blank" rel="noreferrer" onClick={() => onMarkRead(post)} className="shrink-0">
            <img src={post.thumbnail} alt="" className={`h-16 w-20 rounded-lg border object-cover ${isDark ? "border-white/10" : "border-slate-100"}`} />
          </a>
        )}
      </div>
      {post.summary && <p className={`mt-3 line-clamp-3 text-sm leading-6 ${isDark ? "text-white/50" : "text-slate-500"}`}>{post.summary}</p>}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => <span key={tag} className={`rounded-md border px-1.5 py-0.5 text-2xs ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-500"}`}>{tag}</span>)}
        </div>
      )}
      <div className="mt-auto flex items-center justify-end pt-4">
        <a href={post.url} target="_blank" rel="noreferrer" onClick={() => onMarkRead(post)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>
          열기 <IconExternal />
        </a>
      </div>
    </article>
  );
}

function Skeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className={`mb-3 h-4 w-20 animate-pulse rounded ${pulse}`} />
      <div className={`mb-2 h-5 w-4/5 animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-2/3 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

export default function NewsTechBlogsPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [data, setData] = useState<TechBlogListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState(() => getInitialSearchParam("source", SOURCE_ALL));
  const [query, setQuery] = useState(() => getInitialSearchParam("q", ""));
  const [bookmarkedOnly, setBookmarkedOnly] = useState(() => getInitialSearchParam("bookmarked") === "true");
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState<Map<string, number>>(new Map());
  const [trend, setTrend] = useState<TechBlogTrendSummary | null>(null);
  const [trendStreaming, setTrendStreaming] = useState("");
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendOpen, setTrendOpen] = useState(false);
  const [hideTrendPanel, setHideTrendPanel] = useState(false);
  const trendJobRef = useRef<{ jobId: string; cancel: () => void } | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const revealTrendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageClass = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const inputClass = isDark ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50" : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-indigo-300";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  const load = useCallback(async (force = false, requestedSource = SOURCE_ALL) => {
    setError(null);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await listTechBlogPosts({
        source: requestedSource,
        limit: requestedSource === SOURCE_ALL ? 300 : 500,
        refresh: force,
        bookmarked: bookmarkedOnly,
      });
      setData(result);
      setSourceCount((prev) => {
        const next = requestedSource === SOURCE_ALL ? new Map<string, number>() : new Map(prev);
        if (requestedSource !== SOURCE_ALL) { next.set(requestedSource, result.posts.length); return next; }
        for (const post of result.posts) next.set(post.sourceId, (next.get(post.sourceId) ?? 0) + 1);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 블로그 목록을 불러오지 못했습니다.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [bookmarkedOnly]);

  const loadTrend = useCallback(async (force = false) => {
    // 진행 중인 작업 취소
    if (trendJobRef.current) {
      trendJobRef.current.cancel();
      cancelTechBlogTrend(trendJobRef.current.jobId).catch(() => {});
      trendJobRef.current = null;
    }

    setTrendError(null);
    setTrendStreaming("");
    setTrend(null);
    setTrendLoading(true);
    setTrendOpen(true);

    try {
      const { jobId } = await enqueueTechBlogTrend({ days: 14, source, refresh: force });
      const cancel = subscribeTechBlogTrend(
        jobId,
        (chunk) => setTrendStreaming((prev) => prev + chunk),
        (result) => {
          setTrend(result);
          setTrendStreaming("");
          setTrendLoading(false);
          trendJobRef.current = null;
        },
        (msg) => {
          setTrendError(msg);
          setTrendStreaming("");
          setTrendLoading(false);
          trendJobRef.current = null;
        },
      );
      trendJobRef.current = { jobId, cancel };
    } catch (e) {
      setTrendError(e instanceof Error ? e.message : "트렌드 분석에 실패했습니다.");
      setTrendLoading(false);
    }
  }, [source]);

  const loadLatestTrend = useCallback(async (requestedSource = SOURCE_ALL) => {
    try {
      const result = await getLatestTechBlogTrendSummary({ days: 14, source: requestedSource });
      setTrend(result);
      setTrendStreaming("");
      setTrendError(null);
      setTrendOpen(false);
    } catch {
      // 저장된 트렌드 조회 실패는 목록 사용을 막지 않는다.
    }
  }, []);

  const patchPost = useCallback((id: string, patch: Partial<TechBlogPost>) => {
    setData((prev) => prev ? {
      ...prev,
      posts: prev.posts.map((post) => post.id === id ? { ...post, ...patch } : post),
    } : prev);
  }, []);

  const handleToggleBookmark = useCallback((post: TechBlogPost) => {
    const next = !post.bookmarked;
    patchPost(post.id, { bookmarked: next });
    updateTechBlogBookmark(post.id, next).then((updated) => {
      patchPost(post.id, updated);
    }).catch(() => {
      patchPost(post.id, { bookmarked: post.bookmarked });
    });
  }, [patchPost]);

  const handleMarkRead = useCallback((post: TechBlogPost) => {
    if (post.readAt) return;
    const readAt = new Date().toISOString();
    patchPost(post.id, { readAt });
    markTechBlogRead(post.id).then((updated) => {
      patchPost(post.id, updated);
    }).catch(() => {
      patchPost(post.id, { readAt: undefined });
    });
  }, [patchPost]);

  useEffect(() => { load(false, source); }, [load, source]);
  useEffect(() => { loadLatestTrend(source); }, [loadLatestTrend, source]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollTop = el.scrollTop;
      const max = el.scrollHeight - el.clientHeight;
      const nearBottom = max - scrollTop < 32;

      if (revealTrendTimerRef.current) clearTimeout(revealTrendTimerRef.current);
      if (nearBottom || scrollTop <= 8) {
        setHideTrendPanel(false);
      } else {
        setHideTrendPanel(true);
        revealTrendTimerRef.current = setTimeout(() => setHideTrendPanel(false), 220);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (revealTrendTimerRef.current) clearTimeout(revealTrendTimerRef.current);
    };
  }, []);

  const posts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.posts ?? []).filter((post) => {
      const sm = source === SOURCE_ALL || post.sourceId === source;
      const qm = !normalized || post.title.toLowerCase().includes(normalized) || post.sourceName.toLowerCase().includes(normalized) || (post.summary ?? "").toLowerCase().includes(normalized) || post.tags.some((t) => t.toLowerCase().includes(normalized));
      return sm && qm;
    });
  }, [data?.posts, query, source]);

  const sourceGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<TechBlogListResult["sources"]>>();
    for (const item of data?.sources ?? []) {
      const cat = item.category ?? "기타";
      groups.set(cat, [...(groups.get(cat) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [data?.sources]);

  const selectedSource = source === SOURCE_ALL ? null : data?.sources.find((s) => s.id === source) ?? null;
  const selectedSourceLabel = selectedSource?.name ?? "전체 출처";
  const markdownComponents = useMemo(() => ({
    h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-2.5 mt-4 text-base font-bold first:mt-0 sm:text-lg">{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-2 mt-3.5 text-sm font-bold first:mt-0 sm:text-base">{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{children}</h3>,
    p: ({ children }: { children?: ReactNode }) => <p className="my-2.5 text-sm leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ul>,
    ol: ({ children }: { children?: ReactNode }) => <ol className="my-2.5 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ol>,
    li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }: { children?: ReactNode }) => <strong className="font-bold">{children}</strong>,
  }), []);
  const trendFloatingPanel = (
    <div className={`pointer-events-none fixed inset-x-0 bottom-20 sm:bottom-4 z-30 px-4 transition-all duration-200 ease-out sm:px-6 lg:px-8 ${
      hideTrendPanel ? "translate-y-[calc(100%+5rem)] opacity-0" : "translate-y-0 opacity-100"
    }`}>
      <div className="pointer-events-auto mx-auto w-full max-w-3xl">
        {trendOpen && (trendStreaming || (trend && !trendLoading) || trendError) && (
          <div className={`mb-2 max-h-[45vh] overflow-y-auto rounded-2xl border p-4 text-sm leading-7 shadow-xl backdrop-blur ${isDark ? "border-white/10 bg-slate-950/90 text-white/70" : "border-slate-200 bg-white/95 text-slate-700"}`}>
            {trendError ? (
              <p className={isDark ? "text-red-300" : "text-red-600"}>{trendError}</p>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <IconSparkles spinning={trendLoading} />
                  <span className={`text-xs font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>AI 트렌드 분석 결과</span>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {trendStreaming || trend?.summary || ""}
                </ReactMarkdown>
                {trendLoading && trendStreaming && (
                  <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-indigo-400 align-text-bottom" />
                )}
                {!trendLoading && (trend?.keywords ?? []).length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {(trend!.keywords).map((kw) => (
                      <span key={kw.keyword} className={`rounded-lg px-2 py-1 text-xs font-medium ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>
                        {kw.keyword}
                      </span>
                    ))}
                  </div>
                )}
                {!trendLoading && trend?.generatedAt && (
                  <div className={`mt-3 text-[11px] ${isDark ? "text-white/35" : "text-slate-400"}`}>
                    저장된 분석 · {new Date(trend.generatedAt).toLocaleString("ko-KR")}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div className={`rounded-xl border px-3 py-2 shadow-xl backdrop-blur transition-colors ${isDark ? "border-slate-700/70 bg-[#0f172a]/95" : "border-slate-200 bg-slate-50/95"}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className={`truncate text-xs font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>
                AI 트렌드 분석
              </div>
              <div className={`truncate text-[11px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                {trend
                  ? "저장된 분석 결과가 있습니다. 펼쳐서 확인할 수 있습니다."
                  : "최근 2주 기술 블로그의 반복 키워드와 기업별 작성 흐름을 요약합니다."}
              </div>
            </div>
            {(trend || trendError || trendStreaming) && (
              <button
                onClick={() => setTrendOpen((open) => !open)}
                className={`h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors ${isDark ? "border-white/10 text-white/70 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-white"}`}
              >
                {trendOpen ? "접기" : "펼치기"}
              </button>
            )}
            <button
              onClick={() => loadTrend(!!trend)}
              disabled={trendLoading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white shadow-md shadow-brand-primary/30 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={trend ? "트렌드 재분석" : "AI 트렌드 분석"}
            >
              {trendLoading ? (
                <IconSparkles spinning />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <main ref={scrollRef} className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-36 pt-5 sm:px-6 lg:px-8">
        {/* Header */}
        <section className={`rounded-2xl border p-5 shadow-sm ${panelClass}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <button onClick={() => router.push("/news")} className={`mb-2 text-sm font-semibold ${isDark ? "text-white/45 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}>
                ← 뉴스
              </button>
              <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>기술 블로그</h1>
              <p className={`mt-1 text-sm ${textSub}`}>국내외 엔지니어링 블로그의 최신 글을 한 곳에서 모아봅니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목, 출처, 태그 검색" className={`h-9 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-200/50 sm:w-60 ${inputClass}`} />
              <button
                type="button"
                onClick={() => setSourcePickerOpen(true)}
                className={`inline-flex h-9 min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition lg:hidden ${
                  source !== SOURCE_ALL
                    ? isDark ? "border-indigo-300/30 bg-indigo-500/15 text-indigo-300" : "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <path d="M3 4h10M5 8h6M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="truncate">{selectedSourceLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setBookmarkedOnly((value) => !value)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${
                  bookmarkedOnly
                    ? isDark ? "border-amber-300/30 bg-amber-400/15 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"
                    : isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <IconBookmark filled={bookmarkedOnly} />
                북마크
              </button>
              <button onClick={() => load(true, source)} disabled={refreshing} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-60 ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>
                <IconRefresh spinning={refreshing} />
                새로고침
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr] lg:items-start">
          {/* Sidebar */}
          <aside className={`hidden lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-y-auto rounded-2xl border p-3 shadow-sm lg:block ${panelClass}`}>
            <div className={`px-2 pb-2 text-xs font-semibold ${textSub}`}>필터</div>
            <div className="space-y-0.5">
              <button onClick={() => setBookmarkedOnly((value) => !value)} className={`mb-2 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${bookmarkedOnly ? isDark ? "bg-amber-400/15 font-semibold text-amber-300" : "bg-amber-50 font-semibold text-amber-700" : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"}`}>
                <span className="inline-flex items-center gap-1.5"><IconBookmark filled={bookmarkedOnly} />북마크만</span>
                <span className={`text-xs ${textSub}`}>{data?.posts.filter((post) => post.bookmarked).length ?? 0}</span>
              </button>
            </div>
            <div className={`px-2 pb-2 pt-2 text-xs font-semibold ${textSub}`}>출처</div>
            <div className="space-y-0.5">
              <button onClick={() => setSource(SOURCE_ALL)} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${source === SOURCE_ALL ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700" : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"}`}>
                <span>전체</span>
                <span className={`text-xs ${textSub}`}>{data?.posts.length ?? 0}</span>
              </button>
              {sourceGroups.map(([category, sources]) => (
                <div key={category}>
                  <div className={`px-2.5 py-1 text-2xs font-semibold uppercase tracking-widest ${isDark ? "text-white/25" : "text-slate-400"}`}>{category}</div>
                  {sources.map((item) => (
                    <button key={item.id} onClick={() => setSource(item.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${source === item.id ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700" : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"}`}>
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className={`shrink-0 text-xs ${textSub}`}>{sourceCount.get(item.id) ?? 0}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {selectedSource && (
              <div className={`mt-3 border-t pt-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
                <div className={`text-xs font-semibold mb-1 ${textSub}`}>{selectedSource.name}</div>
                {selectedSource.description && (
                  <p className={`text-xs leading-5 ${isDark ? "text-white/40" : "text-slate-500"}`}>
                    {Array.isArray(selectedSource.description) ? selectedSource.description.join(" · ") : selectedSource.description}
                  </p>
                )}
              </div>
            )}
          </aside>

          {/* Content */}
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`text-sm font-medium ${textSub}`}>{loading ? "불러오는 중..." : `${posts.length}개의 글`}</span>
              {data?.fetchedAt && <span className={`text-xs ${textSub}`}>마지막 수집 {new Date(data.fetchedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>}
            </div>
            {error && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${isDark ? "border-red-900/50 bg-red-950/40 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>}
            {loading ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} isDark={isDark} />)}</div>
            ) : posts.length === 0 ? (
              <div className={`py-16 text-center text-sm ${textSub}`}>{query ? `"${query}"에 해당하는 글이 없습니다.` : "블로그 글이 없습니다."}</div>
            ) : (
              <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
                {posts.map((post) => (
                  <BlogCard
                    key={post.id}
                    post={post}
                    isDark={isDark}
                    onToggleBookmark={handleToggleBookmark}
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {sourcePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-3 pb-3 pt-16 backdrop-blur-sm lg:hidden"
          onClick={() => setSourcePickerOpen(false)}
        >
          <section
            className={`max-h-[78vh] w-full overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`}
            role="dialog"
            aria-modal="true"
            aria-label="기술 블로그 출처 선택"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
              <div>
                <h2 className="text-sm font-bold">출처 선택</h2>
                <p className={`mt-0.5 text-xs ${textSub}`}>보고 싶은 기술 블로그 사이트를 고르세요.</p>
              </div>
              <button
                type="button"
                onClick={() => setSourcePickerOpen(false)}
                className={`rounded-lg p-2 transition ${isDark ? "text-white/50 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                aria-label="닫기"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <div className="max-h-[calc(78vh-4.5rem)] overflow-y-auto p-3">
              <button
                type="button"
                onClick={() => { setSource(SOURCE_ALL); setSourcePickerOpen(false); }}
                className={`mb-2 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition ${
                  source === SOURCE_ALL
                    ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700"
                    : isDark ? "text-white/70 hover:bg-white/5" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>전체 출처</span>
                <span className={`text-xs ${textSub}`}>{data?.posts.length ?? 0}</span>
              </button>
              {sourceGroups.map(([category, sources]) => (
                <div key={category} className="mb-2">
                  <div className={`px-3 py-1.5 text-2xs font-semibold uppercase tracking-widest ${isDark ? "text-white/30" : "text-slate-400"}`}>{category}</div>
                  <div className="space-y-1">
                    {sources.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { setSource(item.id); setSourcePickerOpen(false); }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                          source === item.id
                            ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700"
                            : isDark ? "text-white/70 hover:bg-white/5" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="min-w-0 truncate">{item.name}</span>
                        <span className={`shrink-0 text-xs ${textSub}`}>{sourceCount.get(item.id) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {trendFloatingPanel}
    </main>
  );
}
