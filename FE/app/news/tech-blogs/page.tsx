"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getTechBlogTrendSummary,
  listTechBlogPosts,
  type TechBlogListResult,
  type TechBlogPost,
  type TechBlogTrendSummary,
} from "@/lib/api/tech-blogs";

const SOURCE_ALL = "all";

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

function BlogCard({ post, isDark }: { post: TechBlogPost; isDark: boolean }) {
  const tags = Array.from(new Set(post.tags)).slice(0, 4);
  return (
    <article className={`group rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 ${isDark ? "border-white/10 bg-white/5 hover:border-indigo-400/30" : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-2xs font-semibold ${isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"}`}>{post.sourceName}</span>
            <span className={`text-2xs ${isDark ? "text-white/35" : "text-slate-400"}`}>{formatDate(post.publishedAt)}</span>
          </div>
          <a href={post.url} target="_blank" rel="noreferrer" className={`line-clamp-2 text-base font-semibold leading-snug transition-colors ${isDark ? "text-white hover:text-indigo-300" : "text-slate-900 hover:text-indigo-600"}`}>
            {post.title}
          </a>
        </div>
        {post.thumbnail && (
          <a href={post.url} target="_blank" rel="noreferrer" className="shrink-0">
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
      <div className="mt-4 flex items-center justify-end">
        <a href={post.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>
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
  const [source, setSource] = useState(SOURCE_ALL);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState<Map<string, number>>(new Map());
  const [trend, setTrend] = useState<TechBlogTrendSummary | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

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
      const result = await listTechBlogPosts({ source: requestedSource, limit: requestedSource === SOURCE_ALL ? 300 : 500, refresh: force });
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
  }, []);

  const loadTrend = useCallback(async (force = false) => {
    setTrendError(null);
    setTrendLoading(true);
    try {
      const result = await getTechBlogTrendSummary({ days: 14, source, refresh: force });
      setTrend(result);
    } catch (e) {
      setTrendError(e instanceof Error ? e.message : "트렌드 분석에 실패했습니다.");
    } finally { setTrendLoading(false); }
  }, [source]);

  useEffect(() => { load(false, source); }, [load, source]);

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

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
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
            <div className="flex items-center gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목, 출처, 태그 검색" className={`h-9 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-200/50 sm:w-60 ${inputClass}`} />
              <button onClick={() => load(true, source)} disabled={refreshing} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-60 ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>
                <IconRefresh spinning={refreshing} />
                새로고침
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className={`hidden h-fit rounded-2xl border p-3 shadow-sm lg:block ${panelClass}`}>
            <div className={`px-2 pb-2 text-xs font-semibold ${textSub}`}>출처</div>
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
            {/* Trend */}
            <div className={`mt-3 border-t pt-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
              <button onClick={() => !trend && loadTrend()} disabled={trendLoading} className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold transition disabled:opacity-60 ${isDark ? "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/20" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
                <IconSparkles spinning={trendLoading} />
                {trendLoading ? "분석 중..." : trend ? "트렌드 재분석" : "AI 트렌드 분석"}
              </button>
              {trendError && <p className={`mt-2 px-1 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{trendError}</p>}
              {trend && !trendLoading && (
                <div className={`mt-2 rounded-lg p-2.5 text-xs leading-5 ${isDark ? "bg-white/5 text-white/60" : "bg-slate-50 text-slate-600"}`}>
                  {trend.summary}
                  {(trend.keywords ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(trend.keywords ?? []).map((kw) => <span key={kw.keyword} className={`rounded px-1.5 py-0.5 font-medium ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>{kw.keyword}</span>)}
                    </div>
                  )}
                </div>
              )}
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
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{posts.map((post) => <BlogCard key={post.id} post={post} isDark={isDark} />)}</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
