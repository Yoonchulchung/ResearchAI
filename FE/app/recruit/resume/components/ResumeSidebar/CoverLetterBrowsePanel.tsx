"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeSelfIntro } from "@/lib/api/resume";
import {
  searchCoverLetterQuestions,
  createScrapeByCompanySSE,
  type CoverLetterQuestionSearchItem,
  type ScrapeByCompanyEvent,
} from "@/lib/api/recruit/cover-letter";
function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const PAGE_SIZE = 20;

export function CoverLetterBrowsePanel({
  companyName,
  onInsertSelfIntro,
}: {
  companyName?: string;
  onInsertSelfIntro?: (si: ResumeSelfIntro) => void;
}) {
  // ── 키워드 검색 (내부 DB) ──────────────────────────────────────────────────
  const [query, setQuery] = useState(companyName?.trim() ?? "");
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [items, setItems] = useState<CoverLetterQuestionSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── 린커리어 기업명 수집 ───────────────────────────────────────────────────
  const [companyInput, setCompanyInput] = useState(companyName?.trim() ?? "");
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{
    current: number;   // 지금까지 처리한 건수
    total: number;     // 이번 페이지 기준 예상 총 건수
    page: number;
    maxPages: number;
    label: string;     // 현재 저장 중인 항목 설명
    done: boolean;
    collected: number;
    skipped: number;
    error: string | null;
  } | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevCompanyName = useRef(companyName);

  // companyName prop 변경 시 두 입력 모두 동기화
  useEffect(() => {
    if (companyName !== prevCompanyName.current) {
      prevCompanyName.current = companyName;
      const trimmed = companyName?.trim() ?? "";
      setQuery(trimmed);
      setCompanyInput(trimmed);
    }
  }, [companyName]);

  // ── 검색 (초기 / query 변경) ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setOffset(0);
    setItems([]);
    setHasMore(false);

    if (!query.trim()) return; // 빈 검색어면 결과 초기화만 하고 API 호출 안 함

    const timer = window.setTimeout(() => {
      setLoading(true);
      searchCoverLetterQuestions(query.trim(), PAGE_SIZE, 0, sortDir)
        .then((res) => {
          if (cancelled) return;
          setItems(res.items);
          setTotal(res.total);
          setHasMore(res.hasMore);
          setOffset(res.items.length);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setTotal(0);
          setHasMore(false);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, sortDir]);

  // ── 더 불러오기 ────────────────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    searchCoverLetterQuestions(query.trim(), PAGE_SIZE, offset, sortDir)
      .then((res) => {
        setItems((prev) => [...prev, ...res.items]);
        setTotal(res.total);
        setHasMore(res.hasMore);
        setOffset((prev) => prev + res.items.length);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, query, offset, sortDir]);

  // ── IntersectionObserver 무한 스크롤 ──────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // ── 린커리어 SSE 수집 ──────────────────────────────────────────────────────
  const handleScrape = () => {
    const company = companyInput.trim();
    if (!company || scraping) return;

    sseRef.current?.close();
    setScraping(true);
    setScrapeProgress({ current: 0, total: 0, page: 0, maxPages: 3, label: "목록 불러오는 중...", done: false, collected: 0, skipped: 0, error: null });

    const sse = createScrapeByCompanySSE(company, { maxPages: 3, delayMs: 600 });
    sseRef.current = sse;

    sse.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ScrapeByCompanyEvent;
        if (event.type === "page") {
          setScrapeProgress((prev) => prev && ({
            ...prev,
            page: event.page,
            maxPages: event.total,
            total: prev.total + event.found,
            label: `페이지 ${event.page}/${event.total} 확인 중...`,
          }));
        } else if (event.type === "item") {
          const label = [event.season, event.position].filter(Boolean).join(" · ") || "자소서";
          setScrapeProgress((prev) => prev && ({
            ...prev,
            current: prev.current + 1,
            label,
          }));
        } else if (event.type === "done") {
          setScrapeProgress((prev) => prev && ({
            ...prev,
            current: prev.total,
            done: true,
            collected: event.collected,
            skipped: event.skipped,
            label: `완료 — 신규 ${event.collected}건`,
          }));
          setScraping(false);
          sse.close();
          setQuery(company);
        } else if (event.type === "error") {
          setScrapeProgress((prev) => prev && ({ ...prev, error: event.message, done: true }));
          setScraping(false);
          sse.close();
        }
      } catch { /* ignore */ }
    };

    sse.onerror = () => {
      setScrapeProgress((prev) => prev && ({ ...prev, error: "연결이 끊겼습니다.", done: true }));
      setScraping(false);
      sse.close();
    };
  };

  useEffect(() => () => sseRef.current?.close(), []);

  const handleInsert = (item: CoverLetterQuestionSearchItem) => {
    onInsertSelfIntro?.({
      id: createLocalId(),
      question: item.question,
      answer: item.answer,
      category: item.tags,
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2.5">
        {/* 린커리어 기업명 수집 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
              린커리어 기업 자소서
            </span>
            <Link
              href="/recruit/cover-letter"
              className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors font-medium"
            >
              전체 보기 →
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 focus-within:border-emerald-400 transition-colors">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-emerald-400">
                <path d="M10 2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M4.5 6.5h4M6.5 4.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                value={companyInput}
                onChange={(e) => setCompanyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                placeholder="현대모비스, 삼성전자..."
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-300"
              />
            </div>
            {scraping ? (
              <button
                onClick={() => {
                  sseRef.current?.close();
                  setScraping(false);
                  setScrapeProgress((prev) => prev && ({ ...prev, done: true, label: "중지됨" }));
                }}
                className="shrink-0 flex items-center gap-1 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <rect x="1.5" y="1.5" width="6" height="6" rx="0.5" fill="currentColor" />
                </svg>
                중지
              </button>
            ) : (
              <button
                onClick={handleScrape}
                disabled={!companyInput.trim()}
                className="shrink-0 flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5h7M6 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                수집
              </button>
            )}
          </div>

          {/* 진행 게이지 */}
          {scrapeProgress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium truncate max-w-50 ${
                  scrapeProgress.error ? "text-red-500" :
                  scrapeProgress.done ? "text-emerald-600" :
                  "text-slate-600"
                }`}>
                  {scrapeProgress.error ?? scrapeProgress.label}
                </span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">
                  {scrapeProgress.total > 0
                    ? `${scrapeProgress.current} / ${scrapeProgress.total}건`
                    : scraping ? "..." : ""}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                {scrapeProgress.error ? (
                  <div className="h-full w-full bg-red-400 rounded-full" />
                ) : scrapeProgress.total > 0 ? (
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (scrapeProgress.current / scrapeProgress.total) * 100)}%`,
                      backgroundColor: scrapeProgress.done ? "#10b981" : "#34d399",
                    }}
                  />
                ) : (
                  <div className="h-full w-1/3 rounded-full bg-emerald-300 animate-pulse" />
                )}
              </div>
              {scrapeProgress.done && !scrapeProgress.error && (
                <p className="text-xs text-slate-400">
                  신규 {scrapeProgress.collected}건
                  {scrapeProgress.skipped > 0 && ` · 이미 있음 ${scrapeProgress.skipped}건`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 키워드 검색 (내부 DB) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
              키워드 검색
            </span>
            {total > 0 && (
              <span className="text-xs text-slate-400">{total.toLocaleString()}건</span>
            )}
            <button
              onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
              className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={`transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`}>
                <path d="M2 3.5h7M3.5 6h4M5 8.5h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {sortDir === 'desc' ? '최신순' : '오래된순'}
            </button>
            {loading && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-slate-300">
              <path d="M5.8 10.1a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6ZM9.2 9.2l2.3 2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="성장과정, 도전, 협업, 갈등..."
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-300"
            />
          </div>
        </div>
      </div>

      {/* 결과 목록 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
        {loading ? (
          <div className="flex justify-center py-10">
            <span className="w-5 h-5 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-slate-200">
              <path d="M5 4h18v20H5V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 9h12M8 13h12M8 17h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-400">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <>
            {items.map((item) => {
              const coverLetter = item.coverLetter;
              const isOpen = expanded === item.id;
              return (
                <div key={item.id} className="rounded-md border border-slate-200 bg-white">
                  <button
                    onClick={() => setExpanded((v) => (v === item.id ? null : item.id))}
                    className="w-full min-h-[76px] flex items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="none"
                      className={`mt-1.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        {coverLetter.season && (
                          <span className="text-xs font-medium text-slate-400 shrink-0">
                            {coverLetter.season}
                          </span>
                        )}
                        <p className="text-sm font-bold leading-5 text-slate-800 wrap-break-word">
                          {coverLetter.company || "기업명 없음"}
                        </p>
                        {coverLetter.position && (
                          <span className="text-xs text-slate-400 wrap-break-word">
                            {coverLetter.position}
                          </span>
                        )}
                        <Link
                          href={`/recruit/cover-letter?cover=${encodeURIComponent(item.coverLetterId)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-auto shrink-0 text-xs text-slate-300 hover:text-indigo-500 transition-colors"
                          title="자소서 상세 보기"
                        >
                          ↗
                        </Link>
                      </div>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 line-clamp-2 wrap-break-word">
                        {item.question || `문항 ${item.number}`}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.tags?.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-xs leading-5 px-1.5 rounded-sm bg-indigo-50 text-indigo-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-3 pb-4 pt-3 flex flex-col gap-3">
                      <p className="text-sm text-slate-700 leading-7 whitespace-pre-wrap">{item.answer}</p>
                      {item.keywords && item.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.keywords.slice(0, 10).map((keyword) => (
                            <span key={keyword} className="text-xs px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleInsert(item)}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                        >
                          문항 가져오기
                        </button>
                        {coverLetter.url && (
                          <a
                            href={coverLetter.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
                          >
                            원문 보기
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 무한 스크롤 센티넬 */}
            <div ref={sentinelRef} className="h-4 flex items-center justify-center">
              {loadingMore && (
                <span className="w-4 h-4 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
