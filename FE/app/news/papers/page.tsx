"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  cancelPaperSummary,
  cancelPaperTrend,
  enqueuePaperSummary,
  enqueuePaperTrend,
  getLatestPaperTrendSummary,
  listPapers,
  markPaperRead,
  subscribePaperSummary,
  subscribePaperTrend,
  type Paper,
  type PaperListResult,
  type PaperTrendSummary,
  updatePaperBookmark,
} from "@/lib/api/papers";
import {
  IconBookmark,
  IconRefresh,
  PaperCard,
  PaperSkeleton,
  PaperTrendPanel,
  SummaryModal,
} from "../_components/paper-page-parts";

const SOURCE_ALL = "all";

function getInitialSearchParam(name: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

export default function NewsPapersPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [data, setData] = useState<PaperListResult | null>(null);
  const [source, setSource] = useState(() => getInitialSearchParam("source", SOURCE_ALL));
  const [query, setQuery] = useState(() => getInitialSearchParam("q", ""));
  const [bookmarkedOnly, setBookmarkedOnly] = useState(() => getInitialSearchParam("bookmarked") === "true");
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(new Set());
  const [summaryPaper, setSummaryPaper] = useState<Paper | null>(null);
  const summaryJobsRef = useRef<Map<string, { jobId: string; close: () => void }>>(new Map());

  const patchPaper = useCallback((id: string, patch: Partial<Paper>) => {
    setData((prev) => prev ? {
      ...prev,
      papers: prev.papers.map((paper) => paper.id === id ? { ...paper, ...patch } : paper),
    } : prev);
    setSummaryPaper((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
  }, []);

  const handleMarkRead = useCallback((paper: Paper) => {
    if (paper.readAt) return;
    const readAt = new Date().toISOString();
    patchPaper(paper.id, { readAt });
    markPaperRead(paper.id).then((updated) => {
      patchPaper(paper.id, updated);
    }).catch(() => {
      patchPaper(paper.id, { readAt: undefined });
    });
  }, [patchPaper]);

  const handleToggleBookmark = useCallback((paper: Paper) => {
    const next = !paper.bookmarked;
    patchPaper(paper.id, { bookmarked: next });
    updatePaperBookmark(paper.id, next).then((updated) => {
      patchPaper(paper.id, updated);
    }).catch(() => {
      patchPaper(paper.id, { bookmarked: paper.bookmarked });
    });
  }, [patchPaper]);

  const handleOpenReader = useCallback((paper: Paper) => {
    handleMarkRead(paper);
    router.push(`/news/papers/${encodeURIComponent(paper.id)}`);
  }, [handleMarkRead, router]);

  // Trend state
  const [trend, setTrend] = useState<PaperTrendSummary | null>(null);
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
      const result = await listPapers({
        source: requestedSource,
        limit: requestedSource === SOURCE_ALL ? 300 : 800,
        refresh: force,
        bookmarked: bookmarkedOnly,
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "논문 목록을 불러오지 못했습니다.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [source, bookmarkedOnly]);

  const loadTrend = useCallback(async (forceRefresh = false) => {
    if (trendJobRef.current) {
      trendJobRef.current.cancel();
      cancelPaperTrend(trendJobRef.current.jobId).catch(() => {});
      trendJobRef.current = null;
    }

    setTrendError(null);
    setTrendStreaming("");
    setTrend(null);
    setTrendLoading(true);
    setTrendOpen(true);

    try {
      const { jobId } = await enqueuePaperTrend({ refresh: forceRefresh });
      const cancel = subscribePaperTrend(
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
      const result = await getLatestPaperTrendSummary();
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
        cancelPaperSummary(jobId).catch(() => {});
      }
      summaryJobsRef.current.clear();
      if (trendJobRef.current) {
        trendJobRef.current.cancel();
        cancelPaperTrend(trendJobRef.current.jobId).catch(() => {});
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

  const handleSummarize = useCallback(async (paper: Paper, refresh = false) => {
    const running = summaryJobsRef.current.get(paper.id);
    if (running) {
      running.close();
      cancelPaperSummary(running.jobId).catch(() => {});
      summaryJobsRef.current.delete(paper.id);
    }

    setSummarizingIds((prev) => new Set(prev).add(paper.id));
    try {
      const { jobId } = await enqueuePaperSummary(paper.id, { refresh });
      const cleanup = () => {
        summaryJobsRef.current.delete(paper.id);
        setSummarizingIds((prev) => {
          const next = new Set(prev);
          next.delete(paper.id);
          return next;
        });
      };

      const close = subscribePaperSummary(
        jobId,
        (result) => {
          setData((prev) => {
            if (!prev) return prev;
            let updatedPaper: Paper | null = null;
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
  const selectedSource = source === SOURCE_ALL ? null : data?.sources.find((item) => item.id === source) ?? null;
  const selectedSourceLabel = selectedSource?.name ?? "전체 출처";


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
        <section className={`rounded-md border p-5 ${panelClass}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <button onClick={() => router.push("/news")} className={`mb-2 text-sm font-semibold ${isDark ? "text-white/45 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}>
                ← 뉴스
              </button>
              <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>핫한 논문</h1>
              <p className={`mt-1 text-sm ${textSub}`}>Hugging Face Trending Papers와 NeurIPS 최신 proceedings를 모아봅니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목, 저자, 태그 검색" className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-200/50 sm:w-60 ${inputClass}`} />
              <button
                type="button"
                onClick={() => setSourcePickerOpen(true)}
                className={`inline-flex h-9 min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition lg:hidden ${
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
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition ${
                  bookmarkedOnly
                    ? isDark ? "border-amber-300/30 bg-amber-400/15 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"
                    : isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <IconBookmark filled={bookmarkedOnly} />
                북마크
              </button>
              <button onClick={() => load(true)} disabled={refreshing} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition disabled:opacity-60 ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>
                <IconRefresh spinning={refreshing} />
                새로고침
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr] lg:items-start">
          {/* Sidebar */}
          <aside className={`hidden h-fit rounded-md border p-3 lg:block ${panelClass}`}>
            <div className={`px-2 pb-2 text-xs font-semibold ${textSub}`}>필터</div>
            <div className="space-y-0.5">
              <button onClick={() => setBookmarkedOnly((value) => !value)} className={`mb-2 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition ${bookmarkedOnly ? isDark ? "bg-amber-400/15 font-semibold text-amber-300" : "bg-amber-50 font-semibold text-amber-700" : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"}`}>
                <span className="inline-flex items-center gap-1.5"><IconBookmark filled={bookmarkedOnly} />북마크만</span>
                <span className={`text-xs ${textSub}`}>{data?.papers.filter((paper) => paper.bookmarked).length ?? 0}</span>
              </button>
            </div>
            <div className={`px-2 pb-2 pt-2 text-xs font-semibold ${textSub}`}>출처</div>
            <div className="space-y-0.5">
              <button onClick={() => setSource(SOURCE_ALL)} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition ${source === SOURCE_ALL ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700" : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"}`}>
                <span>전체</span>
                <span className={`text-xs ${textSub}`}>{data?.papers.length ?? 0}</span>
              </button>
              {(data?.sources ?? []).map((item) => (
                <button key={item.id} onClick={() => setSource(item.id)} className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition ${source === item.id ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700" : isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"}`}>
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
            {error && <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${isDark ? "border-red-900/50 bg-red-950/40 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>}
            {loading ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{Array.from({ length: 8 }).map((_, i) => <PaperSkeleton key={i} isDark={isDark} />)}</div>
            ) : papers.length === 0 ? (
              <div className={`py-16 text-center text-sm ${textSub}`}>{query ? `"${query}"에 해당하는 논문이 없습니다.` : "논문이 없습니다."}</div>
            ) : (
              <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
                {papers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    isDark={isDark}
                    summarizing={summarizingIds.has(paper.id)}
                    onSummarize={handleSummarize}
                    onOpenSummary={setSummaryPaper}
                    onOpenReader={handleOpenReader}
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
            className={`max-h-[78vh] w-full overflow-hidden rounded-md border ${isDark ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`}
            role="dialog"
            aria-modal="true"
            aria-label="핫한 논문 출처 선택"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
              <div>
                <h2 className="text-sm font-bold">출처 선택</h2>
                <p className={`mt-0.5 text-xs ${textSub}`}>보고 싶은 논문 출처를 고르세요.</p>
              </div>
              <button
                type="button"
                onClick={() => setSourcePickerOpen(false)}
                className={`rounded-md p-2 transition ${isDark ? "text-white/50 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
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
                className={`mb-2 flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-sm transition ${
                  source === SOURCE_ALL
                    ? isDark ? "bg-indigo-500/15 font-semibold text-indigo-300" : "bg-indigo-50 font-semibold text-indigo-700"
                    : isDark ? "text-white/70 hover:bg-white/5" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>전체 출처</span>
                <span className={`text-xs ${textSub}`}>{data?.papers.length ?? 0}</span>
              </button>
              <div className="space-y-1">
                {(data?.sources ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setSource(item.id); setSourcePickerOpen(false); }}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${
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
          </section>
        </div>
      )}
      <PaperTrendPanel
        trendOpen={trendOpen}
        trendStreaming={trendStreaming}
        trend={trend}
        trendLoading={trendLoading}
        trendError={trendError}
        hideTrendPanel={hideTrendPanel}
        isDark={isDark}
        onToggleOpen={() => setTrendOpen((open) => !open)}
        onAnalyze={() => loadTrend(!!trend)}
      />
    </main>
  );
}
