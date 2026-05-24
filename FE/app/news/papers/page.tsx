"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/contexts/ThemeContext";
import {
  cancelHotPaperSummary,
  cancelHotPaperTrend,
  enqueueHotPaperSummary,
  enqueueHotPaperTrend,
  getLatestHotPaperTrendSummary,
  listHotPapers,
  subscribeHotPaperSummary,
  subscribeHotPaperTrend,
  type HotPaper,
  type HotPaperListResult,
  type HotPaperTrendSummary,
} from "@/lib/api/hot-papers";

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

function IconSparkles({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.2 9.4L3.8 11L5.4 11.6L3.8 12.2L3.2 13.8L2.6 12.2L1 11.6L2.6 11L3.2 9.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function PaperCard({
  paper,
  isDark,
  summarizing,
  onSummarize,
  onOpenSummary,
  onOpenReader,
}: {
  paper: HotPaper;
  isDark: boolean;
  summarizing: boolean;
  onSummarize: (paper: HotPaper, refresh?: boolean) => void;
  onOpenSummary: (paper: HotPaper) => void;
  onOpenReader: (paper: HotPaper) => void;
}) {
  const [abstractOpen, setAbstractOpen] = useState(false);

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
      {paper.summary && (
        <div className="mt-3">
          <p className={`${abstractOpen ? "" : "line-clamp-4"} whitespace-pre-line text-sm leading-6 ${isDark ? "text-white/55" : "text-slate-600"}`}>
            {paper.summary}
          </p>
          {paper.summary.length > 220 && (
            <button
              type="button"
              onClick={() => setAbstractOpen((open) => !open)}
              className={`mt-2 text-xs font-semibold transition ${isDark ? "text-indigo-300 hover:text-indigo-200" : "text-indigo-600 hover:text-indigo-700"}`}
            >
              {abstractOpen ? "초록 접기" : "초록 전체 보기"}
            </button>
          )}
        </div>
      )}
      {paper.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(new Set(paper.tags)).slice(0, 4).map((tag) => <span key={tag} className={`rounded-md border px-1.5 py-0.5 text-2xs ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-500"}`}>{tag}</span>)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => paper.aiSummary ? onOpenSummary(paper) : onSummarize(paper)}
          disabled={summarizing}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${isDark ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15" : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
        >
          <IconSparkles spinning={summarizing} />
          {summarizing ? "요약 중..." : paper.aiSummary ? "AI 요약 보기" : "AI 요약"}
        </button>
        {paper.pdfUrl && (
          <button
            onClick={() => onOpenReader(paper)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${isDark ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4"/><path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            PDF 읽기
          </button>
        )}
        {paper.codeUrl && <a href={paper.codeUrl} target="_blank" rel="noreferrer" className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Code</a>}
        <a href={paper.url} target="_blank" rel="noreferrer" className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>원문 보기</a>
      </div>
    </article>
  );
}

function SummaryModal({
  paper,
  isDark,
  onClose,
  onRefresh,
  refreshing,
}: {
  paper: HotPaper;
  isDark: boolean;
  onClose: () => void;
  onRefresh: (paper: HotPaper) => void;
  refreshing: boolean;
}) {
  const markdownComponents = {
    h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-3 mt-6 text-lg font-bold leading-snug first:mt-0 sm:text-xl">{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-2.5 mt-5 text-base font-bold leading-snug first:mt-0 sm:text-lg">{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-2 mt-4 text-sm font-bold leading-snug first:mt-0 sm:text-base">{children}</h3>,
    p: ({ children }: { children?: ReactNode }) => <p className="my-3.5 text-sm sm:text-base leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="my-3.5 list-disc space-y-2 pl-5 text-sm sm:text-base leading-relaxed">{children}</ul>,
    ol: ({ children }: { children?: ReactNode }) => <ol className="my-3.5 list-decimal space-y-2 pl-5 text-sm sm:text-base leading-relaxed">{children}</ol>,
    li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
    strong: ({ children }: { children?: ReactNode }) => <strong className="font-bold">{children}</strong>,
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className={`my-3 border-l-4 pl-4 text-sm sm:text-base ${isDark ? "border-indigo-400/50 text-white/65" : "border-indigo-200 text-slate-600"}`}>
        {children}
      </blockquote>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <code className={`rounded px-1.5 py-0.5 text-[0.85em] ${isDark ? "bg-white/10 text-indigo-200" : "bg-slate-100 text-indigo-700"}`}>
        {children}
      </code>
    ),
    pre: ({ children }: { children?: ReactNode }) => (
      <pre className={`my-3 overflow-x-auto rounded-xl p-4 text-[11px] sm:text-xs leading-relaxed ${isDark ? "bg-black/30 text-white/80" : "bg-slate-100 text-slate-700"}`}>
        {children}
      </pre>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <section
        className={`flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="논문 AI 요약"
      >
        <header className={`border-b px-5 py-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className={`mb-2 flex flex-wrap items-center gap-2 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                <span className={`rounded-md px-2 py-1 font-semibold ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>{paper.sourceName}</span>
                {paper.aiSummaryModel && <span>{paper.aiSummaryModel}</span>}
                {paper.aiSummaryAt && <span>{new Date(paper.aiSummaryAt).toLocaleString("ko-KR")}</span>}
              </div>
              <h2 className="line-clamp-2 text-lg font-bold leading-snug">{paper.title}</h2>
            </div>
            <button
              onClick={onClose}
              className={`shrink-0 rounded-lg border px-2 py-1 text-sm font-bold transition ${isDark ? "border-white/10 text-white/70 hover:bg-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <div className={`${isDark ? "text-white/85" : "text-slate-900"}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {paper.aiSummary || "아직 AI 요약이 없습니다."}
            </ReactMarkdown>
          </div>
        </div>
        <footer className={`flex flex-wrap justify-end gap-2 border-t px-5 py-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <button
            onClick={() => onRefresh(paper)}
            disabled={refreshing}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${isDark ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15" : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
          >
            <IconSparkles spinning={refreshing} />
            {refreshing ? "재요약 중..." : "AI 재요약"}
          </button>
          <a
            href={paper.url}
            target="_blank"
            rel="noreferrer"
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}
          >
            원문 보기
          </a>
        </footer>
      </section>
    </div>
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
  const [source, setSource] = useState(() => getInitialSearchParam("source", SOURCE_ALL));
  const [query, setQuery] = useState(() => getInitialSearchParam("q", ""));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(new Set());
  const [summaryPaper, setSummaryPaper] = useState<HotPaper | null>(null);
  const summaryJobsRef = useRef<Map<string, { jobId: string; close: () => void }>>(new Map());

  const handleOpenReader = useCallback((paper: HotPaper) => {
    router.push(`/news/papers/${encodeURIComponent(paper.id)}`);
  }, [router]);

  // Trend state
  const [trend, setTrend] = useState<HotPaperTrendSummary | null>(null);
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

  const load = useCallback(async (force = false, requestedSource = source) => {
    setError(null);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await listHotPapers({
        source: requestedSource,
        limit: requestedSource === SOURCE_ALL ? 300 : 800,
        refresh: force,
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "논문 목록을 불러오지 못했습니다.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [source]);

  const loadTrend = useCallback(async (forceRefresh = false) => {
    if (trendJobRef.current) {
      trendJobRef.current.cancel();
      cancelHotPaperTrend(trendJobRef.current.jobId).catch(() => {});
      trendJobRef.current = null;
    }

    setTrendError(null);
    setTrendStreaming("");
    setTrend(null);
    setTrendLoading(true);
    setTrendOpen(true);

    try {
      const { jobId } = await enqueueHotPaperTrend({ refresh: forceRefresh });
      const cancel = subscribeHotPaperTrend(
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
  }, []);

  const loadLatestTrend = useCallback(async () => {
    try {
      const result = await getLatestHotPaperTrendSummary();
      if (result) {
        setTrend(result);
        setTrendOpen(false);
      }
    } catch {
      // 저장된 트렌드 조회 실패는 목록 사용을 막지 않는다.
    }
  }, []);

  useEffect(() => { load(false, source); }, [load, source]);
  useEffect(() => { loadLatestTrend(); }, [loadLatestTrend]);

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

  useEffect(() => {
    return () => {
      for (const { jobId, close } of summaryJobsRef.current.values()) {
        close();
        cancelHotPaperSummary(jobId).catch(() => {});
      }
      summaryJobsRef.current.clear();
      if (trendJobRef.current) {
        trendJobRef.current.cancel();
        cancelHotPaperTrend(trendJobRef.current.jobId).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!summaryPaper) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSummaryPaper(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [summaryPaper]);

  const handleSummarize = useCallback(async (paper: HotPaper, refresh = false) => {
    const running = summaryJobsRef.current.get(paper.id);
    if (running) {
      running.close();
      cancelHotPaperSummary(running.jobId).catch(() => {});
      summaryJobsRef.current.delete(paper.id);
    }

    setSummarizingIds((prev) => new Set(prev).add(paper.id));
    try {
      const { jobId } = await enqueueHotPaperSummary(paper.id, { refresh });
      const cleanup = () => {
        summaryJobsRef.current.delete(paper.id);
        setSummarizingIds((prev) => {
          const next = new Set(prev);
          next.delete(paper.id);
          return next;
        });
      };

      const close = subscribeHotPaperSummary(
        jobId,
        (result) => {
          setData((prev) => {
            if (!prev) return prev;
            let updatedPaper: HotPaper | null = null;
            const nextPapers = prev.papers.map((item) => {
              if (item.id !== paper.id) return item;
              updatedPaper = {
                ...item,
                aiSummary: result.aiSummary,
                aiSummaryModel: result.aiSummaryModel,
                aiSummaryAt: result.aiSummaryAt,
              };
              return updatedPaper;
            });
            if (summaryPaper?.id === paper.id && updatedPaper) setSummaryPaper(updatedPaper);
            return { ...prev, papers: nextPapers };
          });
          cleanup();
        },
        (msg) => {
          setError(msg || "AI 요약에 실패했습니다.");
          cleanup();
        },
      );
      summaryJobsRef.current.set(paper.id, { jobId, close });
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 요약에 실패했습니다.");
      setSummarizingIds((prev) => {
        const next = new Set(prev);
        next.delete(paper.id);
        return next;
      });
    }
  }, [summaryPaper?.id]);

  const papers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.papers ?? []).filter((paper) => {
      return !normalized || paper.title.toLowerCase().includes(normalized) || paper.sourceName.toLowerCase().includes(normalized) || (paper.summary ?? "").toLowerCase().includes(normalized) || paper.authors.some((a) => a.toLowerCase().includes(normalized)) || paper.tags.some((t) => t.toLowerCase().includes(normalized));
    });
  }, [data?.papers, query]);

  const sourceCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const paper of data?.papers ?? []) map.set(paper.sourceId, (map.get(paper.sourceId) ?? 0) + 1);
    return map;
  }, [data?.papers]);

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
                  <span className={`text-xs font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>AI 연구 트렌드 분석</span>
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
                AI 연구 트렌드 분석
              </div>
              <div className={`truncate text-[11px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                {trend
                  ? "저장된 분석 결과가 있습니다. 펼쳐서 확인할 수 있습니다."
                  : "현재 핫한 논문들의 연구 주제, 방법론 흐름을 AI가 요약합니다."}
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
      {summaryPaper && (
        <SummaryModal
          paper={summaryPaper}
          isDark={isDark}
          onClose={() => setSummaryPaper(null)}
          onRefresh={(paper) => handleSummarize(paper, true)}
          refreshing={summarizingIds.has(summaryPaper.id)}
        />
      )}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-36 pt-5 sm:px-6 lg:px-8">
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

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr] lg:items-start">
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
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {papers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    isDark={isDark}
                    summarizing={summarizingIds.has(paper.id)}
                    onSummarize={handleSummarize}
                    onOpenSummary={setSummaryPaper}
                    onOpenReader={handleOpenReader}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {trendFloatingPanel}
    </main>
  );
}
