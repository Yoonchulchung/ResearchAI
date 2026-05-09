"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  listCoverLetters,
  startScraping,
  stopScraping,
  getScrapingStatus,
  type CoverLetter,
  type ScrapeStatus,
} from "@/lib/api/cover-letter";
import { useTheme } from "@/contexts/ThemeContext";

const PAGE_SIZE = 30;

export default function CoverLetterPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [items, setItems] = useState<CoverLetter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CoverLetter | null>(null);

  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const listScrollTopRef = useRef(0);
  const detailScrollTopRef = useRef(0);

  const loaderRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (p: number, reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await listCoverLetters(p, PAGE_SIZE);
      setTotal(res.total);
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setHasMore(res.items.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    load(1, true);
    getScrapingStatus().then(setStatus).catch(() => {});
  }, []);

  // Poll status while running
  useEffect(() => {
    if (status?.running) {
      statusTimerRef.current = setInterval(async () => {
        try {
          const s = await getScrapingStatus();
          setStatus(s);
          if (!s.running) {
            clearInterval(statusTimerRef.current!);
            load(1, true);
          }
        } catch {}
      }, 2000);
    }
    return () => { if (statusTimerRef.current) clearInterval(statusTimerRef.current); };
  }, [status?.running]);

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    const scrollTop = e.currentTarget.scrollTop;
    const delta = scrollTop - listScrollTopRef.current;
    listScrollTopRef.current = scrollTop;
    if (Math.abs(delta) < 4) return;
    if (delta > 0 && scrollTop > 10) setIsHeaderHidden(true);
    else if (delta < 0) setIsHeaderHidden(false);
  }, []);

  const handleDetailScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    const scrollTop = e.currentTarget.scrollTop;
    const delta = scrollTop - detailScrollTopRef.current;
    detailScrollTopRef.current = scrollTop;
    if (Math.abs(delta) < 4) return;
    if (delta > 0 && scrollTop > 10) setIsHeaderHidden(true);
    else if (delta < 0) setIsHeaderHidden(false);
  }, []);

  const handleStart = async () => {
    setScrapeLoading(true);
    try {
      await startScraping();
      const s = await getScrapingStatus();
      setStatus(s);
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleStop = async () => {
    setScrapeLoading(true);
    try {
      await stopScraping();
      const s = await getScrapingStatus();
      setStatus(s);
      load(1, true);
    } finally {
      setScrapeLoading(false);
    }
  };

  // Infinite scroll
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        const next = page + 1;
        setPage(next);
        load(next);
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, page, load]);

  const filtered = items.filter((cl) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      cl.company.toLowerCase().includes(q) ||
      cl.position.toLowerCase().includes(q) ||
      cl.season.toLowerCase().includes(q) ||
      cl.questions.some(
        (item) =>
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q),
      )
    );
  });

  return (
    <div className={`h-full flex flex-col overflow-hidden ${isGlass ? "p-3 pr-4 pb-4 bg-transparent" : "bg-slate-100"}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl border border-white/20" : ""}`}>

        {/* Topbar */}
        <div className={`shrink-0 flex flex-col border-b transition-all duration-200 ease-out overflow-hidden ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : "bg-white border-slate-200/60"} ${
          isHeaderHidden
            ? "max-md:max-h-0 max-md:opacity-0 max-md:-translate-y-2 max-md:pointer-events-none max-md:border-b-0"
            : "max-md:max-h-28 max-md:opacity-100 max-md:translate-y-0"
        }`}>
          {/* Row 1: title + action */}
          <div className="flex items-center gap-2 px-4 sm:px-5 pt-2.5 pb-1.5">
            <button
              onClick={() => { if (selected) setSelected(null); else router.back(); }}
              className={`shrink-0 flex items-center gap-1 text-sm transition-colors ${isDark ? "text-white/50 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>합격 자소서</span>
            <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{total.toLocaleString()}건</span>
            <div className="flex-1" />
            {/* Start / Stop button */}
            {status?.running ? (
              <button
                onClick={handleStop}
                disabled={scrapeLoading}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-50 bg-red-500 text-white border-red-500 hover:bg-red-600"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor"/>
                </svg>
                중단
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={scrapeLoading}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-50 bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
              >
                {scrapeLoading ? (
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
                    <path d="M2 1.5L9.5 5.5L2 9.5V1.5Z" fill="currentColor"/>
                  </svg>
                )}
                크롤링 시작
              </button>
            )}
          </div>
          {/* Row 2: status badge (only when running) */}
          {status?.running && (
            <div className="flex items-center px-4 sm:px-5 pb-2">
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                수집 중 {status.totalCollected.toLocaleString()}건 · p.{status.currentPage}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* Left: list */}
          <div className={`${selected ? "hidden md:flex" : "flex"} flex-col w-full md:w-[360px] shrink-0 border-r overflow-hidden ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-200"}`}>

            {/* Search */}
            <div className={`shrink-0 px-3 py-2.5 border-b ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-100"}`}>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="기업명, 직무, 시즌 검색"
                  className={`w-full pl-7 pr-3 py-1.5 text-sm rounded-lg border focus:outline-none transition-colors ${
                    isGlass && isDark
                      ? "bg-white/10 border-white/20 text-white placeholder-white/40 focus:border-white/40"
                      : "bg-slate-50 border-slate-200 text-slate-700 placeholder-slate-400 focus:bg-white focus:border-indigo-300"
                  }`}
                />
              </div>
            </div>

            {/* List items */}
            <div onScroll={handleListScroll} className="flex-1 overflow-y-auto">
              {filtered.length === 0 && !loading && (
                <div className={`flex flex-col items-center justify-center h-full gap-2 ${isDark ? "text-white/30" : "text-slate-300"}`}>
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <path d="M6 4h20v24H6V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M10 10h12M10 15h12M10 20h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm">자소서가 없습니다</p>
                </div>
              )}
              {filtered.map((cl) => (
                <button
                  key={cl.id}
                  onClick={() => setSelected(cl)}
                  className={`w-full text-left px-4 py-3.5 border-b transition-colors ${
                    selected?.id === cl.id
                      ? isGlass
                        ? isDark ? "bg-white/10 border-white/10" : "bg-indigo-50/80 border-black/10"
                        : "bg-indigo-50 border-slate-100"
                      : isGlass
                        ? isDark ? "hover:bg-white/5 border-white/5" : "hover:bg-black/5 border-black/5"
                        : "hover:bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isDark ? "text-white/90" : "text-slate-800"}`}>
                        {cl.company || "기업명 없음"}
                      </p>
                      <p className={`text-xs mt-0.5 truncate ${isDark ? "text-white/50" : "text-slate-500"}`}>
                        {[cl.position, cl.season].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {cl.questions.length > 0 && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-400"}`}>
                        {cl.questions.length}문항
                      </span>
                    )}
                  </div>
                  {cl.questions[0] && (
                    <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${isDark ? "text-white/35" : "text-slate-400"}`}>
                      {cl.questions[0].answer || cl.questions[0].question}
                    </p>
                  )}
                </button>
              ))}
              <div ref={loaderRef} className="py-3 flex justify-center">
                {loading && (
                  <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin block" />
                )}
              </div>
            </div>
          </div>

          {/* Right: detail */}
          <div onScroll={handleDetailScroll} className={`flex-1 overflow-y-auto ${selected ? "flex" : "hidden md:flex"} flex-col`}>
            {!selected ? (
              <div className={`flex flex-col items-center justify-center h-full gap-3 ${isDark ? "text-white/25" : "text-slate-300"}`}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <path d="M8 5h24v30H8V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M13 13h14M13 19h14M13 25h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <p className="text-sm">자소서를 선택하세요</p>
              </div>
            ) : (
              <div className="px-3 py-3 sm:px-8 sm:py-6 sm:max-w-3xl w-full mx-auto">
                {/* Header */}
                <div className="mb-5 sm:mb-6">
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-3 ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                    합격 자소서
                  </span>
                  <h1 className={`text-[28px] sm:text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                    {selected.company}
                  </h1>
                  <div className={`flex flex-wrap gap-2 text-sm ${isDark ? "text-white/50" : "text-slate-500"}`}>
                    {selected.position && <span>{selected.position}</span>}
                    {selected.position && selected.season && <span>·</span>}
                    {selected.season && <span>{selected.season}</span>}
                  </div>
                  {selected.spec && (
                    <p className={`mt-2 text-[15px] leading-relaxed ${isDark ? "text-white/40" : "text-slate-400"}`}>
                      {selected.spec}
                    </p>
                  )}
                </div>

                <div className={`border-t mb-6 ${isDark ? "border-white/10" : "border-slate-100"}`} />

                {/* Q&A */}
                {selected.questions.length === 0 ? (
                  <p className={`text-sm ${isDark ? "text-white/40" : "text-slate-400"}`}>내용이 없습니다.</p>
                ) : (
                  <div className="space-y-7 sm:space-y-8">
                    {selected.questions.map((q, i) => (
                      <div key={i}>
                        <p className={`text-[15px] sm:text-sm font-semibold mb-3 leading-relaxed ${isDark ? "text-white/80" : "text-slate-700"}`}>
                          <span className={`inline-block w-5 h-5 rounded-full text-xs font-bold text-center leading-5 mr-2 shrink-0 ${isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-500"}`}>
                            {q.number}
                          </span>
                          {q.question}
                        </p>
                        <p className={`text-[15px] sm:text-sm leading-8 sm:leading-7 whitespace-pre-wrap pl-0 sm:pl-7 ${isDark ? "text-white/70" : "text-slate-600"}`}>
                          {q.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
