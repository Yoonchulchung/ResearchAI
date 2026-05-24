"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { listHotPapers, type HotPaper, type HotPaperListResult } from "@/lib/api/hot-papers";

const SOURCE_ALL = "all";

function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

function PaperCard({ paper, isDark }: { paper: HotPaper; isDark: boolean }) {
  return (
    <article className={`rounded-xl border p-4 shadow-sm transition ${isDark ? "border-white/10 bg-white/5 hover:border-indigo-400/30" : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-1 text-2xs font-semibold ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>{paper.sourceName}</span>
        {paper.venue && <span className={`text-2xs ${isDark ? "text-white/35" : "text-slate-400"}`}>{paper.venue}</span>}
        {paper.publishedAt && <span className={`text-2xs ${isDark ? "text-white/35" : "text-slate-400"}`}>{formatDate(paper.publishedAt)}</span>}
        {typeof paper.upvotes === "number" && <span className={`rounded-md px-2 py-1 text-2xs font-semibold ${isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-600"}`}>▲ {paper.upvotes}</span>}
      </div>
      <h2 className={`text-base font-semibold leading-snug ${isDark ? "text-white" : "text-slate-900"}`}>{paper.title}</h2>
      {paper.authors.length > 0 && (
        <p className={`mt-2 line-clamp-1 text-xs ${isDark ? "text-white/35" : "text-slate-400"}`}>
          {paper.authors.slice(0, 8).join(", ")}{paper.authors.length > 8 ? " 외" : ""}
        </p>
      )}
      {paper.summary && <p className={`mt-3 line-clamp-4 text-sm leading-6 ${isDark ? "text-white/50" : "text-slate-500"}`}>{paper.summary}</p>}
      {paper.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(new Set(paper.tags)).slice(0, 4).map((tag) => <span key={tag} className={`rounded-md border px-1.5 py-0.5 text-2xs ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-500"}`}>{tag}</span>)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {paper.codeUrl && <a href={paper.codeUrl} target="_blank" rel="noreferrer" className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Code</a>}
        {paper.pdfUrl && <a href={paper.pdfUrl} target="_blank" rel="noreferrer" className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>arXiv</a>}
        <a href={paper.url} target="_blank" rel="noreferrer" className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>원문 보기</a>
      </div>
    </article>
  );
}

function Skeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className={`mb-3 h-4 w-24 animate-pulse rounded ${pulse}`} />
      <div className={`mb-2 h-5 w-5/6 animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-2/3 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

export default function NewsPapersPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [data, setData] = useState<HotPaperListResult | null>(null);
  const [source, setSource] = useState(SOURCE_ALL);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageClass = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const inputClass = isDark ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50" : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-indigo-300";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  const load = useCallback(async (force = false) => {
    setError(null);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await listHotPapers({ limit: 160, refresh: force });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "논문 목록을 불러오지 못했습니다.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const papers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.papers ?? []).filter((paper) => {
      const sm = source === SOURCE_ALL || paper.sourceId === source;
      const qm = !normalized || paper.title.toLowerCase().includes(normalized) || paper.sourceName.toLowerCase().includes(normalized) || (paper.summary ?? "").toLowerCase().includes(normalized) || paper.authors.some((a) => a.toLowerCase().includes(normalized)) || paper.tags.some((t) => t.toLowerCase().includes(normalized));
      return sm && qm;
    });
  }, [data?.papers, query, source]);

  const sourceCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const paper of data?.papers ?? []) map.set(paper.sourceId, (map.get(paper.sourceId) ?? 0) + 1);
    return map;
  }, [data?.papers]);

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
              <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>핫한 논문</h1>
              <p className={`mt-1 text-sm ${textSub}`}>Hugging Face Trending Papers와 NeurIPS 최신 proceedings를 모아봅니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목, 저자, 태그 검색" className={`h-9 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-200/50 sm:w-60 ${inputClass}`} />
              <button onClick={() => load(true)} disabled={refreshing} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-60 ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>
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
                <span className={`text-xs ${textSub}`}>{data?.papers.length ?? 0}</span>
              </button>
              {(data?.sources ?? []).map((item) => (
                <button key={item.id} onClick={() => setSource(item.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${source === item.id ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700" : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className={`shrink-0 text-xs ${textSub}`}>{sourceCount.get(item.id) ?? 0}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`text-sm font-medium ${textSub}`}>{loading ? "불러오는 중..." : `${papers.length}개의 논문`}</span>
              {data?.fetchedAt && <span className={`text-xs ${textSub}`}>마지막 수집 {new Date(data.fetchedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>}
            </div>
            {error && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${isDark ? "border-red-900/50 bg-red-950/40 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>}
            {loading ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} isDark={isDark} />)}</div>
            ) : papers.length === 0 ? (
              <div className={`py-16 text-center text-sm ${textSub}`}>{query ? `"${query}"에 해당하는 논문이 없습니다.` : "논문이 없습니다."}</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{papers.map((paper) => <PaperCard key={paper.id} paper={paper} isDark={isDark} />)}</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
