"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listHotPapers, type HotPaper, type HotPaperListResult } from "@/lib/api/hot-papers";

const SOURCE_ALL = "all";

function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPaper() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M5 2.5H10.5L14 6V15C14 15.55 13.55 16 13 16H5C4.45 16 4 15.55 4 15V3.5C4 2.95 4.45 2.5 5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10.5 2.5V6H14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 9H11.5M6.5 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function PaperCard({ paper }: { paper: HotPaper }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-indigo-50 px-2 py-1 text-2xs font-semibold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          {paper.sourceName}
        </span>
        {paper.venue && <span className="text-2xs text-slate-400">{paper.venue}</span>}
        {paper.publishedAt && <span className="text-2xs text-slate-400">{formatDate(paper.publishedAt)}</span>}
        {typeof paper.upvotes === "number" && (
          <span className="rounded-md bg-amber-50 px-2 py-1 text-2xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            ▲ {paper.upvotes}
          </span>
        )}
      </div>

      <h2 className="text-base font-semibold leading-snug text-slate-900 dark:text-white">
        {paper.title}
      </h2>

      {paper.authors.length > 0 && (
        <p className="mt-2 line-clamp-1 text-xs text-slate-400">
          {paper.authors.slice(0, 8).join(", ")}
          {paper.authors.length > 8 ? " 외" : ""}
        </p>
      )}

      {paper.summary && (
        <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {paper.summary}
        </p>
      )}

      {paper.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(new Set(paper.tags)).slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-md border border-slate-200 px-1.5 py-0.5 text-2xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {paper.codeUrl && (
          <a href={paper.codeUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            Code
          </a>
        )}
        {paper.pdfUrl && (
          <a href={paper.pdfUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            arXiv
          </a>
        )}
        <a href={paper.url} target="_blank" rel="noreferrer" className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 dark:bg-white dark:text-slate-900">
          원문 보기
        </a>
      </div>
    </article>
  );
}

export default function HotPapersPage() {
  const [data, setData] = useState<HotPaperListResult | null>(null);
  const [source, setSource] = useState(SOURCE_ALL);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setError(null);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await listHotPapers({ limit: 160, refresh: force });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "논문 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const papers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.papers ?? []).filter((paper) => {
      const sourceMatched = source === SOURCE_ALL || paper.sourceId === source;
      const queryMatched =
        !normalized ||
        paper.title.toLowerCase().includes(normalized) ||
        paper.sourceName.toLowerCase().includes(normalized) ||
        (paper.summary ?? "").toLowerCase().includes(normalized) ||
        paper.authors.some((author) => author.toLowerCase().includes(normalized)) ||
        paper.tags.some((tag) => tag.toLowerCase().includes(normalized));
      return sourceMatched && queryMatched;
    });
  }, [data?.papers, query, source]);

  const sourceCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const paper of data?.papers ?? []) {
      map.set(paper.sourceId, (map.get(paper.sourceId) ?? 0) + 1);
    }
    return map;
  }, [data?.papers]);

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                <IconPaper />
                핫 논문 크롤러
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">핫한 논문</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Hugging Face Trending Papers와 NeurIPS 최신 proceedings를 모아봅니다.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목, 저자, 태그 검색"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:w-72"
              />
              <button
                onClick={() => load(true)}
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
          <aside className="hidden h-fit rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:block">
            <div className="px-2 pb-2 text-xs font-semibold text-slate-400">출처</div>
            <div className="space-y-1">
              <button
                onClick={() => setSource(SOURCE_ALL)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition ${source === SOURCE_ALL ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                <span>전체</span>
                <span className="text-xs text-slate-400">{data?.papers.length ?? 0}</span>
              </button>
              {(data?.sources ?? []).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSource(item.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition ${source === item.id ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                >
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{sourceCount.get(item.id) ?? 0}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {loading ? "불러오는 중" : `${papers.length}개의 논문`}
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

            {loading ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 h-5 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="mb-2 h-5 w-5/6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                ))}
              </div>
            ) : papers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                  <IconPaper />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">표시할 논문이 없습니다</p>
                <p className="mt-1 text-sm text-slate-400">검색어나 출처 필터를 조정해보세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {papers.map((paper) => (
                  <PaperCard key={paper.id} paper={paper} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
