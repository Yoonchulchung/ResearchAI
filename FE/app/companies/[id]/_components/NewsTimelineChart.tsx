"use client";

import { useEffect, useState } from "react";
import type { BulkFetchResult, ScrapeHistoricalResult, NewsTimelineEvent, NewsTimelineResult } from "@/lib/api/companies";
import { bulkFetchCompanyNews, scrapeHistoricalNews, getNewsTimeline, analyzeNewsTimeline } from "@/lib/api/companies";
import { getModels } from "@/lib/api/research";
import type { ModelDefinition } from "@/types";
import { NewsTimelineSourcesModal } from "./NewsTimelineSourcesModal";

/* ── 이벤트 타입별 색상 (배지용) ───────────────────────────────── */
const TYPE_META: Record<string, { label: string; color: string }> = {
  product:  { label: "제품·출시", color: "#3b82f6" },
  contract: { label: "수주·계약", color: "#10b981" },
  partner:  { label: "파트너십",  color: "#f97316" },
  invest:   { label: "투자·M&A", color: "#8b5cf6" },
  hr:       { label: "인력·채용", color: "#eab308" },
  risk:     { label: "리스크",    color: "#ef4444" },
  other:    { label: "기타",      color: "#94a3b8" },
};

/* 카테고리 레인 색상 — 최대 8개 */
const LANE_COLORS = [
  "#3b82f6", "#10b981", "#f97316", "#8b5cf6",
  "#eab308", "#ef4444", "#06b6d4", "#ec4899",
];

function formatYM(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}.${m}`;
}

function formatAiCost(estimatedFees: number) {
  if (estimatedFees === 0) return "$0 (무료 또는 로컬 모델)";
  if (estimatedFees < 0.000001) return "< $0.000001";
  return `$${estimatedFees.toFixed(6)}`;
}

/* ── 차트 상수 ───────────────────────────────────────────────── */
const MAIN_X = 10;
const MAIN_W = 3;
const BRANCH_GAP = 18;
const BRANCH_START_X = MAIN_X + MAIN_W / 2 + 12;
const MONTH_ROW_H = 44;
const EVENT_ROW_H = 116;

function laneCx(idx: number) {
  return BRANCH_START_X + idx * BRANCH_GAP;
}

function getTimelineCategories(data: NewsTimelineResult) {
  const months = [...data.months].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  const catFirst: Record<string, string> = {};
  for (const month of [...months].reverse()) {
    for (const event of month.events) catFirst[event.category] = month.yearMonth;
  }
  return Object.keys(catFirst).sort((a, b) => catFirst[a].localeCompare(catFirst[b]));
}

/* ── 차트 본체 ───────────────────────────────────────────────── */
interface ChartProps {
  data: NewsTimelineResult;
  isDark: boolean;
}

type FlatRow =
  | { kind: "month"; ym: string }
  | { kind: "event"; ym: string; cat: string; ev: NewsTimelineEvent };

function Chart({ data, isDark }: ChartProps) {
  // 최신 순 정렬
  const months = [...data.months].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  // 카테고리 — 최초 등장 시점 기준 정렬 (오래된 것 → 왼쪽 레인)
  const categories = getTimelineCategories(data);
  const catColor: Record<string, string> = Object.fromEntries(
    categories.map((cat, i) => [cat, LANE_COLORS[i % LANE_COLORS.length]]),
  );

  // 평탄화
  const rows: FlatRow[] = [];
  for (const m of months) {
    rows.push({ kind: "month", ym: m.yearMonth });
    for (const ev of m.events) rows.push({ kind: "event", ym: m.yearMonth, cat: ev.category, ev });
  }

  // 고정 높이로 y 좌표 계산
  const rowY: number[] = [];
  let y = 0;
  for (const row of rows) {
    rowY.push(y);
    y += row.kind === "month" ? MONTH_ROW_H : EVENT_ROW_H;
  }
  const totalH = y;

  // 카테고리별 최초 등장 행 인덱스
  const catFirstIdx: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "event" && !(row.cat in catFirstIdx)) {
      catFirstIdx[row.cat] = i;
    }
  }

  const svgW = BRANCH_START_X + categories.length * BRANCH_GAP + 6;
  const mainColor = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)";
  const textSec = isDark ? "text-white/40" : "text-slate-400";
  const textPri = isDark ? "text-white/85" : "text-slate-800";
  const cardBg  = isDark ? "bg-white/4 border-white/8" : "bg-white border-slate-100";
  const dividerCls = isDark ? "bg-white/10" : "bg-slate-200";

  if (months.length === 0 || categories.length === 0) return null;

  return (
    <div>
      {/* 범례 */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: catColor[cat] }} />
            <span className={`text-2xs font-semibold ${textSec}`}>{cat}</span>
          </div>
        ))}
      </div>

      {/* 그래프 + 카드 */}
      <div className="relative" style={{ minHeight: totalH }}>
        {/* SVG: 메인 트렁크 + 가지 선 + 도트 */}
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={svgW}
          height={totalH}
          overflow="visible"
        >
          {/* 메인 굵은 수직 선 */}
          <line x1={MAIN_X} y1={0} x2={MAIN_X} y2={totalH} stroke={mainColor} strokeWidth={MAIN_W} strokeLinecap="round" />

          {/* 카테고리 가지 */}
          {categories.map((cat, li) => {
            const cx = laneCx(li);
            const firstIdx = catFirstIdx[cat] ?? 0;
            const firstY = rowY[firstIdx] + EVENT_ROW_H / 2;
            const color = catColor[cat];

            return (
              <g key={cat}>
                {/* 메인에서 가지로 분기하는 곡선 */}
                <path
                  d={`M ${MAIN_X} ${firstY - 14} C ${MAIN_X} ${firstY + 2}, ${cx} ${firstY - 10}, ${cx} ${firstY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                {/* 가지 수직선 (분기점 아래로) */}
                <line
                  x1={cx} y1={firstY} x2={cx} y2={totalH}
                  stroke={color} strokeWidth={1.5} strokeOpacity={0.3}
                />
              </g>
            );
          })}

          {/* 이벤트 도트 */}
          {rows.map((row, i) => {
            if (row.kind !== "event") return null;
            const li = categories.indexOf(row.cat);
            const cx = laneCx(li);
            const cy = rowY[i] + EVENT_ROW_H / 2;
            const isHigh = row.ev.importance === "high";
            const color = catColor[row.cat];

            return (
              <g key={i}>
                {isHigh && (
                  <circle cx={cx} cy={cy} r={10} fill={color} fillOpacity={0.14} />
                )}
                <circle
                  cx={cx} cy={cy}
                  r={isHigh ? 6 : 4}
                  fill={color}
                  stroke={isDark ? "#0f172a" : "#ffffff"}
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </svg>

        {/* 행 콘텐츠 (SVG 폭만큼 왼쪽 패딩) */}
        <div style={{ paddingLeft: svgW + 10 }}>
          {rows.map((row, i) => {
            const h = row.kind === "month" ? MONTH_ROW_H : EVENT_ROW_H;

            if (row.kind === "month") {
              return (
                <div key={i} className="flex items-center gap-3" style={{ height: h }}>
                  <span className={`text-sm font-black ${textPri}`}>{formatYM(row.ym)}</span>
                  <div className={`h-px flex-1 ${dividerCls}`} />
                </div>
              );
            }

            const color = catColor[row.cat];
            const typeMeta = TYPE_META[row.ev.type] ?? TYPE_META.other;
            const isHigh = row.ev.importance === "high";

            return (
              <div key={i} className="flex items-start" style={{ height: h, paddingTop: 6, paddingBottom: 6 }}>
                <div className={`flex-1 rounded-md border p-2.5 ${cardBg} shadow-sm`}>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded px-1.5 py-0.5 text-2xs font-bold text-white" style={{ background: color }}>
                      {row.cat}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-2xs font-semibold" style={{ color: typeMeta.color, background: `${typeMeta.color}15` }}>
                      {typeMeta.label}
                    </span>
                    {isHigh && <span className="ml-auto text-2xs font-black text-red-400">★ 주요</span>}
                  </div>
                  <p className={`line-clamp-2 text-xs leading-relaxed ${textPri}`}>{row.ev.summary}</p>
                  {row.ev.sourceUrl && (
                    <a
                      href={row.ev.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={row.ev.sourceTitle ?? "대표 뉴스 원문 보기"}
                      className={`mt-1.5 inline-flex max-w-full items-center gap-1 text-2xs font-bold transition-colors ${
                        isDark ? "text-blue-300 hover:text-blue-200" : "text-blue-600 hover:text-blue-700"
                      }`}
                    >
                      <span className="truncate">
                        {row.ev.sourceTitle ? `대표 기사 · ${row.ev.sourceTitle}` : "대표 기사 원문 보기"}
                      </span>
                      <span aria-hidden="true" className="shrink-0">↗</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimelineInitSkeleton({ isDark, empty }: { isDark: boolean; empty?: boolean }) {
  const fakeLanes = 6;
  const svgW = BRANCH_START_X + fakeLanes * BRANCH_GAP + 6;
  const mainColor = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const fakeEvents = [
    { y: 40,  lane: 0 }, { y: 40,  lane: 2 }, { y: 40,  lane: 4 },
    { y: 110, lane: 1 }, { y: 110, lane: 3 },
    { y: 180, lane: 0 }, { y: 180, lane: 5 },
    { y: 250, lane: 2 }, { y: 250, lane: 4 },
    { y: 320, lane: 1 }, { y: 320, lane: 3 },
    { y: 390, lane: 0 }, { y: 390, lane: 2 },
  ];

  return (
    <div className="absolute inset-0">
      {/* skeleton SVG */}
      <svg
        className="absolute left-0 top-0 w-auto h-full opacity-50 blur-[1.5px]"
        width={svgW}
        height="100%"
        aria-hidden="true"
      >
        {/* 메인 수직선 */}
        <line x1={MAIN_X} y1={0} x2={MAIN_X} y2="100%" stroke={mainColor} strokeWidth={MAIN_W} strokeLinecap="round" />
        {/* 레인 수직선 */}
        {Array.from({ length: fakeLanes }).map((_, i) => (
          <line
            key={i}
            x1={laneCx(i)} y1={0} x2={laneCx(i)} y2="100%"
            stroke={LANE_COLORS[i % LANE_COLORS.length]}
            strokeWidth={1.5} strokeOpacity={0.2}
          />
        ))}
        {/* 이벤트 점 */}
        {fakeEvents.map(({ y, lane }, i) => {
          const cx = laneCx(lane);
          const color = LANE_COLORS[lane % LANE_COLORS.length];
          return (
            <g key={i}>
              <path
                d={`M ${MAIN_X} ${y} C ${MAIN_X} ${y + 8}, ${cx} ${y - 6}, ${cx} ${y}`}
                fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={0.4}
              />
              <circle cx={cx} cy={y} r={7} fill={color} fillOpacity={0.12} />
              <circle cx={cx} cy={y} r={3.5} fill={color} fillOpacity={0.5} />
            </g>
          );
        })}
      </svg>

      {/* 텍스트 skeleton 바 */}
      <div className="absolute left-14 top-0 right-0 blur-[2px] opacity-40 pointer-events-none select-none">
        {[32, 38, 62, 104, 112, 118, 174, 182, 244, 252, 314, 322, 384].map((top, i) => (
          <div
            key={i}
            className={`absolute h-2.5 rounded ${isDark ? "bg-white/20" : "bg-slate-300"}`}
            style={{ top, left: 0, width: `${35 + (i * 17) % 45}%` }}
          />
        ))}
      </div>

      {/* blur + 오버레이 */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2.5 backdrop-blur-[2px] ${isDark ? "bg-slate-900/40" : "bg-white/50"}`}>
        {empty ? (
          <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>데이터가 없습니다.</p>
        ) : (
          <>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-500" />
            <p className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-400"}`}>타임라인 불러오는 중...</p>
          </>
        )}
      </div>
    </div>
  );
}

function TimelineLoadMoreSkeleton({
  data,
  isDark,
}: {
  data: NewsTimelineResult;
  isDark: boolean;
}) {
  const categories = getTimelineCategories(data);
  const svgW = BRANCH_START_X + categories.length * BRANCH_GAP + 6;
  const mainColor = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)";
  const skeletonRows = [34, 88];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-28 overflow-hidden"
      style={{
        maskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
      }}
    >
      <svg
        className="absolute left-0 top-0 opacity-60 blur-[1px]"
        width={svgW}
        height={112}
        overflow="visible"
      >
        <line
          x1={MAIN_X}
          y1={0}
          x2={MAIN_X}
          y2={112}
          stroke={mainColor}
          strokeWidth={MAIN_W}
          strokeLinecap="round"
        />
        {categories.map((category, index) => {
          const cx = laneCx(index);
          const color = LANE_COLORS[index % LANE_COLORS.length];
          return (
            <line
              key={category}
              x1={cx}
              y1={0}
              x2={cx}
              y2={112}
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.25}
            />
          );
        })}
        {skeletonRows.map((cy, index) => {
          const laneIndex = categories.length ? index % categories.length : 0;
          const cx = laneCx(laneIndex);
          const color = LANE_COLORS[laneIndex % LANE_COLORS.length];
          return (
            <g key={cy}>
              <circle cx={cx} cy={cy} r={8} fill={color} fillOpacity={0.1} />
              <circle
                cx={cx}
                cy={cy}
                r={4}
                fill={color}
                fillOpacity={0.65}
                stroke={isDark ? "#0f172a" : "#ffffff"}
                strokeWidth={2}
              />
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-y-0 right-5 top-1 space-y-2 opacity-55 blur-[2px]" style={{ left: svgW + 10 }}>
        {skeletonRows.map((_, index) => (
          <div
            key={index}
            className={`rounded-md border px-4 py-3 ${
              isDark ? "border-white/10 bg-white/[0.06]" : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="space-y-2">
              <div
                className={`h-2.5 rounded-full ${isDark ? "bg-white/15" : "bg-slate-300"} ${
                  index === 0 ? "w-3/5" : "w-2/5"
                }`}
              />
              <div
                className={`h-2 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} ${
                  index === 0 ? "w-4/5" : "w-2/3"
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
type Phase = "idle" | "fetching" | "analyzing";

interface NewsTimelineChartProps {
  companyId: string;
  companyName: string;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
  onBulkComplete?: () => void;
}

export function NewsTimelineChart({
  companyId,
  companyName,
  isDark,
  panelClass,
  subtleText,
  onBulkComplete,
}: NewsTimelineChartProps) {
  const [data, setData] = useState<NewsTimelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fetchResult, setFetchResult] = useState<BulkFetchResult | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeHistoricalResult | null>(null);
  const [error, setError] = useState("");
  const [lastAiUsage, setLastAiUsage] = useState<NewsTimelineResult["aiUsage"]>();
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNewsTimeline(companyId)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setLastAiUsage(r.aiUsage);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    getModels()
      .then((items) => {
        if (cancelled) return;
        const cloud = items.filter((m) => m.provider !== "ollama" && m.provider !== "llama-cpp");
        const list = cloud.length ? cloud : items;
        const haiku = list.find((m) => m.id.toLowerCase().includes("haiku"));
        setModels(list);
        setSelectedModel((cur) => cur || haiku?.id || list[0]?.id || "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleBulkAnalyze = async (round: number) => {
    if (phase !== "idle" || !selectedModel) return;
    setError("");
    setFetchResult(null);
    setLastAiUsage(undefined);

    // 1단계: 대량 뉴스 수집 (지정 round)
    setPhase("fetching");
    let fetchRes: BulkFetchResult;
    try {
      fetchRes = await bulkFetchCompanyNews(companyId, companyName, round);
      setFetchResult(fetchRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "뉴스 수집 실패");
      setPhase("idle");
      return;
    }

    // 2단계: 타임라인 AI 분석
    setPhase("analyzing");
    try {
      const result = await analyzeNewsTimeline(companyId, companyName, selectedModel, true);
      setData(result);
      setLastAiUsage(result.aiUsage);
      onBulkComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setPhase("idle");
    }
  };

  const handleScrapeHistorical = async () => {
    if (phase !== "idle" || !selectedModel) return;
    setError("");
    setScrapeResult(null);
    setLastAiUsage(undefined);

    // 1단계: Puppeteer로 과거 뉴스 스크래핑
    setPhase("fetching");
    let res: ScrapeHistoricalResult;
    try {
      res = await scrapeHistoricalNews(companyId, companyName);
      setScrapeResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "뉴스 스크래핑 실패");
      setPhase("idle");
      return;
    }

    // 2단계: 새로 수집된 기간 AI 분석 (증분)
    setPhase("analyzing");
    try {
      const result = await analyzeNewsTimeline(companyId, companyName, selectedModel, true);
      setData(result);
      setLastAiUsage(result.aiUsage);
      onBulkComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setPhase("idle");
    }
  };

  const handleAnalyzeOnly = async () => {
    if (phase !== "idle" || !selectedModel) return;
    setPhase("analyzing");
    setError("");
    setLastAiUsage(undefined);
    try {
      const result = await analyzeNewsTimeline(companyId, companyName, selectedModel);
      setData(result);
      setLastAiUsage(result.aiUsage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const hasData = data && data.months.length > 0;

  const phaseLabel =
    phase === "fetching" ? "뉴스 수집 중..." :
    phase === "analyzing" ? "타임라인 분석 중..." :
    "";

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9";

  return (
    <div className={`flex h-full flex-col rounded-md border ${panelClass}`}>
      {/* 헤더 — 고정 영역 */}
      <div className="shrink-0 p-4" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">사업 로드맵</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className={subtleText}>
                {hasData
                  ? `${data.months.length}개월 · AI 입력 ${data.newsCount}건 · 저장 ${data.savedNewsCount}건 · ${data.model}`
                  : "뉴스 기반 월별 사업 활동"}
              </span>
              {hasData && (
                <button
                  type="button"
                  onClick={() => setSourcesOpen(true)}
                  className={`rounded border px-2 py-0.5 text-2xs font-bold transition-colors ${
                    isDark
                      ? "border-white/15 text-white/55 hover:bg-white/10 hover:text-white/80"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  자세히보기
                </button>
              )}
              {lastAiUsage && !busy && (
                <span className={isDark ? "text-emerald-300" : "text-emerald-600"}>
                  예상 비용 {formatAiCost(lastAiUsage.estimatedFees)} · 입력{" "}
                  {lastAiUsage.inputTokens.toLocaleString()} · 출력{" "}
                  {lastAiUsage.outputTokens.toLocaleString()} 토큰
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={busy}
              className={`h-8 min-w-44 rounded border px-2 text-xs font-semibold outline-none ${
                isDark ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {models.length === 0
                ? <option value="">모델 없음</option>
                : models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)
              }
            </select>
            {hasData && (
              <button
                onClick={handleAnalyzeOnly}
                disabled={busy || !selectedModel}
                className={`h-8 rounded-md px-3 text-xs font-bold transition-colors ${
                  busy || !selectedModel
                    ? "cursor-wait bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-white/30"
                    : isDark
                      ? "border border-white/20 text-white/70 hover:bg-white/10"
                      : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                재분석
              </button>
            )}
            <button
              onClick={() => handleBulkAnalyze(0)}
              disabled={busy || !selectedModel}
              className={`h-8 rounded-md px-3 text-xs font-bold transition-colors ${
                busy || !selectedModel
                  ? "cursor-wait bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-white/30"
                  : isDark
                    ? "bg-white text-slate-950 hover:bg-white/90"
                    : "bg-slate-950 text-white hover:bg-slate-800"
              }`}
            >
              {busy ? phaseLabel : hasData ? "대량 수집 + 재분석" : "대량 수집 + 분석"}
            </button>
          </div>
        </div>
        {fetchResult && !busy && (
          <p className={`text-xs ${subtleText}`}>
            수집 완료: 신규 {fetchResult.saved}건 저장 (총 {fetchResult.fetched}건 처리)
          </p>
        )}
        {scrapeResult && !busy && (
          <p className={`text-xs ${subtleText}`}>
            스크래핑 완료 ({scrapeResult.dateFrom} ~ {scrapeResult.dateTo}): 신규 {scrapeResult.saved}건 저장 (총 {scrapeResult.fetched}건 처리)
          </p>
        )}
        {error && (
          <p className="mt-1 rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* 스크롤 콘텐츠 영역 — 데이터 있으면 항상 차트 표시, busy 시 하단 프로그레스로 대체 */}
      <div className={`flex-1 p-4 custom-scrollbar ${loading || !hasData ? "relative overflow-hidden" : "overflow-y-auto"}`}>
        {loading ? (
          <TimelineInitSkeleton isDark={isDark} />
        ) : !hasData && busy ? (
          <div className={`flex items-center gap-2 py-6 text-sm ${subtleText}`}>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {phaseLabel}
          </div>
        ) : !hasData ? (
          <TimelineInitSkeleton isDark={isDark} empty />
        ) : (
          <>
            <Chart data={data} isDark={isDark} />
            <div className="relative overflow-hidden pb-3">
              {/* 스크래핑/분석 중이면 하단 프로그레스 표시, 아니면 + 버튼 */}
              {busy ? (
                <div className={`mt-6 flex flex-col items-center gap-2 py-4 text-sm ${subtleText}`}>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span className="text-xs font-semibold">{phaseLabel}</span>
                </div>
              ) : (
                <>
                  <TimelineLoadMoreSkeleton data={data} isDark={isDark} />
                  <div className="relative -mt-8 flex flex-col items-center">
                    <button
                      type="button"
                      onClick={handleScrapeHistorical}
                      disabled={!selectedModel}
                      title="이전 데이터 더 수집"
                      aria-label="이전 데이터 더 수집"
                      className={`flex h-11 w-11 items-center justify-center rounded-full border text-2xl font-light shadow-sm transition-all ${
                        !selectedModel
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-white/20"
                          : isDark
                            ? "border-white/20 bg-slate-900 text-white/80 hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-500/15 hover:text-indigo-300"
                            : "border-slate-200 bg-white text-slate-500 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                      }`}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                    <span className={`mt-2 text-xs font-bold ${subtleText}`}>이전 데이터 더 수집</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {sourcesOpen && (
        <NewsTimelineSourcesModal
          companyId={companyId}
          companyName={companyName}
          isDark={isDark}
          onClose={() => setSourcesOpen(false)}
        />
      )}
    </div>
  );
}
