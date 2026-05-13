"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getTechBlogTrendSummary, listTechBlogPosts, type TechBlogListResult, type TechBlogPost, type TechBlogTrendSummary } from "@/lib/api/tech-blogs";

const SOURCE_ALL = "all";

function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M6 4H4C3.45 4 3 4.45 3 5V12C3 12.55 3.45 13 4 13H11C11.55 13 12 12.55 12 12V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 3H13V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconFeed() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="4.5" cy="13.5" r="1.4" fill="currentColor" />
      <path d="M3.5 8.5C6.8 8.5 9.5 11.2 9.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 4C9.3 4 14 8.7 14 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSparkles({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.2 9.4L3.8 11L5.4 11.6L3.8 12.2L3.2 13.8L2.6 12.2L1 11.6L2.6 11L3.2 9.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "날짜 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 없음";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function BlogCard({ post }: { post: TechBlogPost }) {
  const tags = Array.from(new Set(post.tags)).slice(0, 4);

  return (
    <article className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-2xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {post.sourceName}
            </span>
            <span className="text-2xs text-slate-400">{formatDate(post.publishedAt)}</span>
          </div>
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-base font-semibold leading-snug text-slate-900 transition-colors hover:text-indigo-600 dark:text-white dark:hover:text-indigo-300"
          >
            {post.title}
          </a>
        </div>
        {post.thumbnail && (
          <a href={post.url} target="_blank" rel="noreferrer" className="shrink-0">
            <img
              src={post.thumbnail}
              alt=""
              className="h-16 w-20 rounded-md border border-slate-100 object-cover dark:border-slate-800"
            />
          </a>
        )}
      </div>
      {post.summary && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {post.summary}
        </p>
      )}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-md border border-slate-200 px-1.5 py-0.5 text-2xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-xs text-slate-400 transition-colors hover:text-indigo-500"
        >
          {hostLabel(post.url)}
        </a>
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 dark:bg-white dark:text-slate-900 dark:hover:bg-indigo-200"
        >
          열기
          <IconExternal />
        </a>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 h-5 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mb-2 h-5 w-4/5 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mb-4 h-5 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

export default function TechBlogsPage() {
  const [data, setData] = useState<TechBlogListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState(SOURCE_ALL);
  const [query, setQuery] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState<Map<string, number>>(new Map());
  const [trend, setTrend] = useState<TechBlogTrendSummary | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  const load = useCallback(async (force = false, requestedSource = SOURCE_ALL) => {
    setError(null);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await listTechBlogPosts({
        source: requestedSource,
        limit: requestedSource === SOURCE_ALL ? 300 : 500,
        refresh: force,
      });
      setData(result);
      setSourceCount((prev) => {
        const next = requestedSource === SOURCE_ALL ? new Map<string, number>() : new Map(prev);
        if (requestedSource !== SOURCE_ALL) {
          next.set(requestedSource, result.posts.length);
          return next;
        }
        for (const post of result.posts) {
          next.set(post.sourceId, (next.get(post.sourceId) ?? 0) + 1);
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "기술 블로그 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false, source);
  }, [load, source]);

  const posts = useMemo(() => {
    const items = data?.posts ?? [];
    const normalized = query.trim().toLowerCase();
    return items.filter((post) => {
      const sourceMatched = source === SOURCE_ALL || post.sourceId === source;
      const queryMatched =
        !normalized ||
        post.title.toLowerCase().includes(normalized) ||
        post.sourceName.toLowerCase().includes(normalized) ||
        (post.summary ?? "").toLowerCase().includes(normalized) ||
        post.tags.some((tag) => tag.toLowerCase().includes(normalized));
      return sourceMatched && queryMatched;
    });
  }, [data?.posts, query, source]);

  const sourceGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<TechBlogListResult["sources"]>>();
    const normalized = sourceQuery.trim().toLowerCase();
    for (const item of data?.sources ?? []) {
      const sourceText = [
        item.name,
        item.id,
        item.category ?? "",
        ...(item.description ?? []),
      ].join(" ").toLowerCase();
      if (normalized && !sourceText.includes(normalized)) continue;

      const category = item.category ?? "기타";
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [data?.sources, sourceQuery]);

  const selectedSource = source === SOURCE_ALL
    ? null
    : data?.sources.find((item) => item.id === source) ?? null;
  const loadedTotalCount = useMemo(
    () => Array.from(sourceCount.values()).reduce((sum, count) => sum + count, 0),
    [sourceCount],
  );

  const loadTrend = useCallback(async (force = false) => {
    setTrendError(null);
    setTrendLoading(true);
    try {
      const result = await getTechBlogTrendSummary({
        days: 14,
        source,
        refresh: force,
      });
      setTrend(result);
    } catch (e) {
      setTrendError(e instanceof Error ? e.message : "기술 블로그 트렌드 분석에 실패했습니다.");
    } finally {
      setTrendLoading(false);
    }
  }, [source]);

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                <IconFeed />
                기술 블로그 크롤러
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">기술 블로그</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                국내외 엔지니어링 블로그의 최신 글을 한 곳에서 모아봅니다.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목, 출처, 태그 검색"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:w-72"
              />
              <button
                onClick={() => load(true, source)}
                disabled={refreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-indigo-200"
              >
                <IconRefresh spinning={refreshing} />
                새로고침
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
          <aside className="hidden max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:block">
            <div className="px-2 pb-2 text-xs font-semibold text-slate-400">출처</div>
            <div className="px-1 pb-2">
              <input
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
                placeholder="기업 이름 검색"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setSource(SOURCE_ALL)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition ${
                  source === SOURCE_ALL
                    ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <span>전체</span>
                <span className="text-xs text-slate-400">{loadedTotalCount || data?.posts.length || 0}</span>
              </button>
              {sourceGroups.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-slate-400">
                  일치하는 출처가 없습니다
                </div>
              ) : sourceGroups.map(([category, items]) => (
                <div key={category} className="pt-2">
                  <div className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-slate-400">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center rounded-md transition ${
                          source === item.id
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        <button
                          onClick={() => setSource(item.id)}
                          className={`flex min-w-0 flex-1 items-center justify-between gap-3 px-2.5 py-2 text-left text-sm ${
                            source === item.id ? "font-semibold" : ""
                          }`}
                          title={item.name}
                        >
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className="shrink-0 text-xs text-slate-400">{sourceCount.get(item.id) ?? 0}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="min-w-0">
            <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <IconSparkles />
                    최근 2주 기술 트렌드
                  </div>
                  <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    수집된 기술 블로그 글을 AI가 읽고 반복 키워드와 핫 토픽을 요약합니다.
                  </p>
                </div>
                <button
                  onClick={() => loadTrend(true)}
                  disabled={trendLoading}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconSparkles spinning={trendLoading} />
                  {trendLoading ? "분석 중" : "AI 분석"}
                </button>
              </div>

              {trendError && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {trendError}
                </div>
              )}

              {trend && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>{trend.postCount}개 글</span>
                    <span>{trend.sourceCount}개 출처</span>
                    <span>{formatDate(trend.from)} - {formatDate(trend.to)}</span>
                    {trend.cached && <span>캐시됨</span>}
                  </div>
                  {trend.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {trend.keywords.slice(0, 12).map((item) => (
                        <span key={item.keyword} className="rounded-md bg-slate-100 px-2 py-1 text-2xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {item.keyword} {item.count}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    {trend.summary}
                  </div>
                </div>
              )}
            </section>

            {selectedSource && (
              <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">{selectedSource.name}</h2>
                  {selectedSource.category && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      {selectedSource.category}
                    </span>
                  )}
                  <a
                    href={selectedSource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-2xs font-semibold text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                  >
                    바로가기
                    <IconExternal />
                  </a>
                </div>
                {selectedSource.description && selectedSource.description.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {selectedSource.description.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {loading ? "불러오는 중" : `${posts.length}개의 글`}
              </div>
              {data?.fetchedAt && (
                <div className="text-xs text-slate-400">마지막 수집 {formatDate(data.fetchedAt)}</div>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            {data && data.errors.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                일부 출처는 응답하지 않았습니다: {data.errors.map((item) => item.sourceId).join(", ")}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <SkeletonCard key={index} />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                  <IconFeed />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">표시할 글이 없습니다</p>
                <p className="mt-1 text-sm text-slate-400">검색어나 출처 필터를 조정해보세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {posts.map((post) => (
                  <BlogCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
