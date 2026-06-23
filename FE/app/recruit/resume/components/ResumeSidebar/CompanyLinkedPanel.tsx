"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCompany,
  getCompanyNews,
  getSavedCompanyNews,
  getNewsTimeline,
  enqueueRoadmapAnalysis,
  subscribeRoadmapAnalysis,
  type CompanyNewsItem,
  type NewsTimelineResult,
} from "@/lib/api/companies";
import {
  analyzeCompanyStream,
  type AnalyzeProgressEvent,
} from "@/lib/api/company-analysis";
import {
  groupNewsByDailyTopic,
  type DailyNewsTopicGroup,
} from "@/news/_lib/news-topic-groups";
import { MODELS } from "@/recruit/_constants";

// ── 카테고리 색상 ─────────────────────────────────────────────────────────────
const CATEGORY_COLOR: Record<string, string> = {
  "AI·플랫폼": "bg-violet-100 text-violet-700",
  "클라우드·인프라": "bg-sky-100 text-sky-700",
  사업수주: "bg-emerald-100 text-emerald-700",
  파트너십: "bg-amber-100 text-amber-700",
  글로벌: "bg-blue-100 text-blue-700",
  "인재·조직": "bg-pink-100 text-pink-700",
  "투자·M&A": "bg-orange-100 text-orange-700",
};

// ── 사업 로드맵 탭 ────────────────────────────────────────────────────────────

function RoadmapSkeleton({ empty }: { empty?: boolean }) {
  const rows = [
    { w: "w-16", bars: ["w-full", "w-4/5"] },
    { w: "w-14", bars: ["w-3/5", "w-full", "w-2/3"] },
    { w: "w-20", bars: ["w-4/5", "w-3/5"] },
    { w: "w-16", bars: ["w-full", "w-2/3", "w-4/5"] },
  ];
  return (
    <div className="relative h-full overflow-hidden px-4 py-3">
      <div className="flex flex-col gap-4 select-none pointer-events-none">
        {rows.map((row, ri) => (
          <div key={ri}>
            <div className={`mb-2 h-3 ${row.w} rounded bg-slate-200`} />
            <div className="flex flex-col gap-2">
              {row.bars.map((bw, bi) => (
                <div key={bi} className="flex gap-2 items-start">
                  <div className="mt-0.5 h-4 w-14 shrink-0 rounded bg-slate-200" />
                  <div className={`h-3 ${bw} rounded bg-slate-100`} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* blur + 메시지 오버레이 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 backdrop-blur-[3px] bg-white/40">
        {empty ? (
          <>
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3v5l3 3"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6.5"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-400">
              분석된 이벤트가 없습니다
            </p>
          </>
        ) : (
          <>
            <div className="h-5 w-5 rounded-full border-2 border-indigo-300 border-t-indigo-500 animate-spin" />
            <p className="text-xs font-semibold text-slate-400">로드 중...</p>
          </>
        )}
      </div>
    </div>
  );
}

// 기업 분석 데이터 없음 → 전체 기업 분석 요청
function AnalysisRequestPanel({
  companyName,
  onDone,
}: {
  companyName: string;
  onDone: () => void;
}) {
  const [model, setModel] = useState(MODELS[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleStart = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setError(null);
    setLog("");
    try {
      await analyzeCompanyStream(
        companyName,
        model,
        (event: AnalyzeProgressEvent) => {
          if (ctrl.signal.aborted) return;
          if (event.type === "log") setLog(event.message);
          if (event.type === "done") onDone();
          if (event.type === "error") setError(event.message);
        },
        ctrl.signal,
      );
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
      }
    } finally {
      if (!ctrl.signal.aborted) setRunning(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-8 text-center h-full">
      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="7.5" stroke="#94a3b8" strokeWidth="1.4" />
          <path d="M6 9l2 2 4-4" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-xs font-semibold text-slate-500">
        기업 분석 데이터가 없습니다
      </p>
      <p className="text-2xs text-slate-400 leading-relaxed">
        AI가 웹에서 {companyName} 정보를 수집해<br />사업 로드맵을 생성합니다.
      </p>

      {error && (
        <p className="text-2xs text-red-400 font-semibold">{error}</p>
      )}

      <div className="w-full flex flex-col gap-2 mt-1">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={running}
          className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300 disabled:opacity-50"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button
          onClick={handleStart}
          disabled={running || !model}
          className="w-full h-8 rounded-md bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {running ? (
            <>
              <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              <span className="truncate max-w-40">{log || "분석 중..."}</span>
            </>
          ) : (
            "기업 분석 요청"
          )}
        </button>
      </div>
    </div>
  );
}

// 기업 분석 데이터 있음, 로드맵 없음 → 사업 로드맵 분석만 요청
function RoadmapAnalysisPanel({
  companyId,
  companyName,
  onDone,
}: {
  companyId: string;
  companyName: string;
  onDone: () => void;
}) {
  const [model, setModel] = useState(MODELS[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const handleStart = async () => {
    setRunning(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { jobId } = await enqueueRoadmapAnalysis(companyId, companyName, model);
      await new Promise<void>((resolve, reject) => {
        subscribeRoadmapAnalysis(
          companyId,
          jobId,
          (event) => {
            if (event.type === "done") resolve();
            if (event.type === "error") reject(new Error(event.message ?? "로드맵 생성 중 오류"));
          },
          ctrl.signal,
        );
        ctrl.signal.addEventListener("abort", () => reject(new Error("취소됨")));
      });
      if (!ctrl.signal.aborted) onDone();
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : "로드맵 생성 중 오류가 발생했습니다.");
        // 에러가 나도 타임라인이 실제로 생성됐을 수 있으므로 리로드
        onDone();
      }
    } finally {
      if (!ctrl.signal.aborted) setRunning(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-8 text-center h-full">
      <div className="h-9 w-9 rounded-full bg-indigo-50 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 14V8l5-5 5 5v6" stroke="#818cf8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="7" y="10" width="4" height="4" rx="0.5" stroke="#818cf8" strokeWidth="1.3" />
        </svg>
      </div>
      <p className="text-xs font-semibold text-slate-500">
        사업 로드맵 데이터가 없습니다
      </p>
      <p className="text-2xs text-slate-400 leading-relaxed">
        수집된 뉴스를 바탕으로<br />{companyName}의 사업 로드맵을 생성합니다.
      </p>

      {error && (
        <p className="text-2xs text-red-400 font-semibold">{error}</p>
      )}

      <div className="w-full flex flex-col gap-2 mt-1">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={running}
          className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300 disabled:opacity-50"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button
          onClick={handleStart}
          disabled={running || !model}
          className="w-full h-8 rounded-md bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {running ? (
            <>
              <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              <span>로드맵 생성 중...</span>
            </>
          ) : (
            "사업 로드맵 분석"
          )}
        </button>
      </div>
    </div>
  );
}

function RoadmapTab({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName?: string;
}) {
  const [timeline, setTimeline] = useState<NewsTimelineResult | null>(null);
  const [hasAnalysis, setHasAnalysis] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getNewsTimeline(companyId),
      getCompany(companyId),
    ])
      .then(([data, company]) => {
        if (!cancelled) {
          setTimeline(data);
          setHasAnalysis(company?.hasAnalysis ?? false);
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "로드 실패"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    return loadTimeline();
  }, [loadTimeline]);

  if (loading) return <RoadmapSkeleton />;
  if (error)
    return (
      <p className="px-4 py-6 text-xs text-red-400 text-center">{error}</p>
    );
  if (!timeline || timeline.months.length === 0) {
    if (!companyName) return <RoadmapSkeleton empty />;
    if (hasAnalysis) {
      return (
        <RoadmapAnalysisPanel
          companyId={companyId}
          companyName={companyName}
          onDone={loadTimeline}
        />
      );
    }
    return (
      <AnalysisRequestPanel
        companyName={companyName}
        onDone={loadTimeline}
      />
    );
  }

  const sorted = [...timeline.months].sort((a, b) =>
    b.yearMonth.localeCompare(a.yearMonth),
  );

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-4 px-4 py-3">
      {sorted.map((month) => (
        <div key={month.yearMonth}>
          <p className="mb-1.5 text-2xs font-bold text-slate-400">
            {month.yearMonth.replace("-", "년 ")}월
          </p>
          <div className="flex flex-col gap-1.5">
            {month.events.map((event: NewsTimelineResult["months"][number]["events"][number], i: number) => {
              const colorClass =
                CATEGORY_COLOR[event.category] ?? "bg-slate-100 text-slate-600";
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span
                    className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-2xs font-semibold ${colorClass}`}
                  >
                    {event.category}
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {event.summary}
                    {event.sourceUrl && (
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-indigo-400 hover:text-indigo-600"
                        title={event.sourceTitle ?? ""}
                      >
                        ↗
                      </a>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 뉴스 탭 ──────────────────────────────────────────────────────────────────
function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function NewsCard({ item }: { item: CompanyNewsItem }) {
  const date = formatDate(item.publishedAt ?? item.fetchedAt);
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 rounded-md border border-slate-100 p-2.5 hover:bg-slate-50 transition-colors"
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="h-16 w-24 shrink-0 rounded border border-slate-100 object-cover bg-slate-50"
        />
      ) : (
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded border border-slate-100 bg-slate-50 text-xs font-bold text-slate-300">
          NEWS
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 line-clamp-2 text-xs font-bold leading-relaxed text-slate-800">
            {item.title}
          </p>
          {date && (
            <span className="shrink-0 pt-0.5 text-2xs text-slate-400">
              {date}
            </span>
          )}
        </div>
        {item.snippet && (
          <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-slate-500">
            {item.snippet}
          </p>
        )}
      </div>
    </a>
  );
}

function TopicGroupCard({
  group,
  newsByUrl,
}: {
  group: DailyNewsTopicGroup;
  newsByUrl: Map<string, CompanyNewsItem>;
}) {
  const [expanded, setExpanded] = useState(false);
  const groupItems = group.items
    .map((item) => newsByUrl.get(item.link))
    .filter((item): item is CompanyNewsItem => Boolean(item));
  const visibleItems = expanded ? groupItems : groupItems.slice(0, 3);

  return (
    <section className="overflow-hidden rounded-md border border-emerald-100 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emerald-50/60 transition-colors"
      >
        <span className="rounded px-2 py-0.5 text-2xs font-black bg-emerald-50 text-emerald-700">
          {group.keyword}
        </span>
        <span className="text-2xs font-semibold text-slate-400">
          같은 날 {groupItems.length}건
        </span>
        <span
          className={`ml-auto text-2xs text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      <div className="border-t border-slate-100">
        {visibleItems.map((item, index) => (
          <a
            key={`${item.id ?? item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className={`group block px-3 py-2 hover:bg-slate-50 transition-colors ${index > 0 ? "border-t border-slate-100" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-xs font-bold leading-relaxed text-slate-800 group-hover:text-emerald-700">
                {item.title}
              </p>
              <span className="shrink-0 text-2xs text-slate-400">
                {formatDate(item.publishedAt ?? item.fetchedAt)}
              </span>
            </div>
            {item.snippet && (
              <p className="mt-0.5 line-clamp-1 text-2xs text-slate-500">
                {item.snippet}
              </p>
            )}
          </a>
        ))}
        {!expanded && groupItems.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50"
          >
            {groupItems.length - 3}건 더 보기
          </button>
        )}
      </div>
    </section>
  );
}

const PAGE_SIZE = 30;

function NewsTab({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName?: string;
}) {
  const [news, setNews] = useState<CompanyNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [collectingLatest, setCollectingLatest] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupTopics, setGroupTopics] = useState(true);
  const offsetRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const armedRef = useRef(true);

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const data = await getSavedCompanyNews(companyId, PAGE_SIZE, offset);
        setNews((prev) => {
          if (replace) return data;
          const seen = new Set(prev.map((n) => n.url));
          return [...prev, ...data.filter((n) => !seen.has(n.url))];
        });
        offsetRef.current = offset + data.length;
        setHasMore(data.length >= PAGE_SIZE);
      } catch (e) {
        if (replace) setError(e instanceof Error ? e.message : "로드 실패");
      } finally {
        if (replace) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    offsetRef.current = 0;
    armedRef.current = true;
    setNews([]);
    setHasMore(true);
    setError(null);
    fetchPage(0, true);
  }, [fetchPage]);

  // 스크롤 sentinel — root를 스크롤 컨테이너로 지정해야 overflow 내부에서 동작함
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          armedRef.current = true;
          return;
        }
        if (!armedRef.current || loadingMore || !hasMore) return;
        armedRef.current = false;
        fetchPage(offsetRef.current, false);
      },
      { root, rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, loadingMore]);

  const newsByUrl = useMemo(
    () => new Map(news.map((item) => [item.url, item])),
    [news],
  );

  const topicGroups = useMemo(() => {
    const items = news.map((item) => ({
      title: item.title,
      link: item.url,
      source: "",
      pubDate: item.publishedAt ?? item.fetchedAt ?? "",
      description: item.snippet,
    }));
    return groupNewsByDailyTopic(items, {
      ignoredKeywords: companyName ? [companyName] : [],
    });
  }, [news, companyName]);

  const groupedCount = topicGroups.filter((g) => g.keyword !== null).length;

  const handleCollectLatest = useCallback(async () => {
    if (collectingLatest) return;
    setCollectingLatest(true);
    setError(null);
    try {
      await getCompanyNews(companyId, 100, 0, true);
      offsetRef.current = 0;
      armedRef.current = true;
      await fetchPage(0, true);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "최신 뉴스를 수집하지 못했습니다.",
      );
    } finally {
      setCollectingLatest(false);
    }
  }, [collectingLatest, companyId, fetchPage]);

  // scrollRef는 항상 렌더된 div에 붙어야 IntersectionObserver root가 null이 아님
  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto flex flex-col gap-2 px-4 py-3"
    >
      {loading ? (
        <p className="py-6 text-xs text-slate-400 text-center">로드 중...</p>
      ) : error ? (
        <p className="py-6 text-xs text-red-400 text-center">{error}</p>
      ) : news.length === 0 ? (
        <p className="py-6 text-xs text-slate-400 text-center">
          저장된 뉴스가 없습니다.
        </p>
      ) : (
        <>
          {/* 묶기 토글 */}
          <label className="flex cursor-pointer items-center justify-end gap-1.5 text-2xs font-semibold text-slate-400">
            <input
              type="checkbox"
              checked={groupTopics}
              onChange={(e) => setGroupTopics(e.target.checked)}
              className="h-3.5 w-3.5 accent-emerald-500"
            />
            {groupTopics && groupedCount > 0
              ? `${groupedCount}개 주제로 묶음`
              : "동일 주제 묶기"}
          </label>

          <div className="relative flex items-center py-1">
            <div className="h-px flex-1 bg-slate-200" />
            <button
              type="button"
              onClick={handleCollectLatest}
              disabled={collectingLatest}
              title="저장된 최신 기사 시각부터 오늘까지 뉴스 수집"
              aria-label="최신 뉴스 추가 수집"
              className="mx-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-white text-base font-medium leading-none text-indigo-500 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-50"
            >
              {collectingLatest ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
              ) : (
                "+"
              )}
            </button>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {groupTopics ? (
            <div className="flex flex-col gap-3">
              {[...new Set(topicGroups.map((g) => g.dateKey))].map((day) => {
                const dayGroups = topicGroups.filter((g) => g.dateKey === day);
                return (
                  <section key={day}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-2xs font-black text-slate-400">
                        {day}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {dayGroups.map((group) => {
                        const item = newsByUrl.get(group.items[0].link);
                        if (!item) return null;
                        return group.keyword ? (
                          <TopicGroupCard
                            key={group.id}
                            group={group}
                            newsByUrl={newsByUrl}
                          />
                        ) : (
                          <NewsCard key={group.id} item={item} />
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {news.map((item, i) => (
                <NewsCard key={item.id ?? item.url ?? i} item={item} />
              ))}
            </div>
          )}
        </>
      )}

      {/* sentinel — 항상 렌더되어야 observer가 등록됨 */}
      <div ref={sentinelRef} className="min-h-1 shrink-0">
        {loadingMore && (
          <p className="py-3 text-center text-2xs text-slate-400">
            더 불러오는 중...
          </p>
        )}
        {!loading && !loadingMore && !hasMore && news.length > 0 && (
          <p className="py-3 text-center text-2xs text-slate-400">
            모두 불러왔습니다.
          </p>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
type Tab = "roadmap" | "news";

export function CompanyLinkedPanel({
  companyId,
  companyName,
  onUnlink,
}: {
  companyId: string;
  companyName?: string;
  onUnlink: () => void;
}) {
  const [tab, setTab] = useState<Tab>("roadmap");

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-3 pb-0 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {companyName && (
              <span className="text-sm font-bold text-slate-700">
                {companyName}
              </span>
            )}
          </div>
          <button
            onClick={onUnlink}
            title="기업 연결 해제"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            연결 해제
          </button>
        </div>

        {/* 탭 */}
        <div className="flex">
          {(["roadmap", "news"] as const).map((t) => {
            const label = t === "roadmap" ? "사업 로드맵" : "뉴스";
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  active
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 탭 콘텐츠 — 각 탭이 자체 스크롤 처리 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "roadmap" ? (
          <RoadmapTab companyId={companyId} companyName={companyName} />
        ) : (
          <NewsTab companyId={companyId} companyName={companyName} />
        )}
      </div>
    </div>
  );
}
