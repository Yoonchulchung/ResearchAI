"use client";

import { useCallback, useEffect, useMemo, useState, useRef, type TouchEvent } from "react";
import { getCompanyShortSelling, type ShortSellingData, type ShortSellingRecord } from "@/lib/api/companies";

type RangeKey = "1m" | "3m" | "6m";
type MetricKey = "volume" | "balance";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "1m", label: "1개월", days: 30 },
  { key: "3m", label: "3개월", days: 90 },
  { key: "6m", label: "6개월", days: 180 },
];

function fmtShares(value: number | null | undefined) {
  if (value == null) return "-";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억 주`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(1)}만 주`;
  return `${value.toLocaleString("ko-KR")}주`;
}

function fmtDate(value?: string) {
  if (!value) return "-";
  return value.replace(/-/g, ". ");
}

function metricValue(record: ShortSellingRecord, metric: MetricKey) {
  return metric === "volume" ? record.shortVolume : record.balanceVolume;
}

export function ShortSellingStatus({
  companyId,
  isDark,
  panelClass,
  subtleText,
}: {
  companyId: string;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}) {
  const [data, setData] = useState<ShortSellingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("1m");
  const [metric, setMetric] = useState<MetricKey>("volume");
  const [chartOffset, setChartOffset] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [hoveredRecord, setHoveredRecord] =
    useState<ShortSellingRecord | null>(null);
  const chartGestureRef = useRef<HTMLDivElement>(null);
  const wheelAccumulator = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCompanyShortSelling(companyId, 180)
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { if (!cancelled) setData({ stockCode: null, records: [], source: "KRX", error: "불러오기 실패" }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const rangeDays = RANGES.find((item) => item.key === range)?.days ?? 30;
  const windowSize = Math.min(rangeDays, data?.records.length ?? 0);
  const maxOffset = Math.max(0, (data?.records.length ?? 0) - windowSize);

  // 데이터 로드 또는 범위 변경 시 가장 최신 구간부터 시작
  useEffect(() => {
    setChartOffset(maxOffset);
    setHoveredRecord(null);
  }, [maxOffset]);
  const records = useMemo(() => {
    const all = data?.records ?? [];
    const offset = Math.max(0, Math.min(maxOffset, chartOffset));
    const end = offset === 0 ? all.length : all.length - offset;
    const start = Math.max(0, end - windowSize);
    return all.slice(start, end).reverse();
  }, [chartOffset, data?.records, maxOffset, windowSize]);

  const latestTrade = data?.records.find((item) => item.shortVolume != null) ?? null;
  const latestBalance = data?.records.find((item) => item.balanceVolume != null) ?? null;
  const maxValue = Math.max(...records.map((item) => Math.abs(metricValue(item, metric) ?? 0)), 1);
  const trackedRecord = hoveredRecord ?? records.at(-1) ?? null;

  const moveRange = useCallback((amount: number) => {
    setChartOffset((prev) => Math.max(0, Math.min(maxOffset, prev + amount)));
  }, [maxOffset]);

  const handleWheel = useCallback((event: globalThis.WheelEvent) => {
    const horizontal = Math.abs(event.deltaX);
    const vertical = Math.abs(event.deltaY);
    // 세로 입력이 더 크면 페이지에 전달하고, 가로 입력이 우세하면 차트 이동에 사용한다.
    if (maxOffset === 0 || horizontal < 2 || horizontal <= vertical) return;
    event.preventDefault();
    event.stopPropagation();
    
    wheelAccumulator.current += event.deltaX;
    const threshold = 10;
    if (Math.abs(wheelAccumulator.current) >= threshold) {
      const steps = Math.min(
        8,
        Math.max(1, Math.floor(Math.abs(wheelAccumulator.current) / threshold)),
      );
      const direction = wheelAccumulator.current > 0 ? 1 : -1;
      moveRange(direction * steps);
      wheelAccumulator.current = wheelAccumulator.current % threshold;
    }
  }, [maxOffset, moveRange]);

  useEffect(() => {
    const target = chartGestureRef.current;
    if (!target) return;
    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleTouchStart = (event: TouchEvent) => {
    setTouchStartX(event.touches[0].clientX);
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (touchStartX == null) return;
    const delta = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 36) {
      // 50px of swipe distance translates to shifting 1 record.
      const steps = Math.round(delta / 50);
      if (steps !== 0) {
        moveRange(steps);
      }
    }
    setTouchStartX(null);
  };

  const borderClr = isDark ? "border-white/10" : "border-slate-200";
  const mutedBg = isDark ? "bg-white/5" : "bg-slate-100";

  return (
    <section
      className={`rounded-md border overflow-hidden ${panelClass}`}
      style={{ overscrollBehaviorX: "contain" }}
    >
      <div className={`border-b px-4 py-3 ${borderClr}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold">공매도 현황</h3>
            <p className={`mt-0.5 text-xs ${subtleText}`}>KRX 기준 · 하루 단위 DB 갱신</p>
          </div>
          <div className={`font-mono text-xs ${subtleText}`}>{data?.stockCode ?? ""}</div>
        </div>
      </div>

      {loading ? (
        <div className={`px-4 py-8 text-center text-sm ${subtleText}`}>공매도 데이터를 불러오는 중...</div>
      ) : data?.error && !data.records.length ? (
        <div className={`px-4 py-8 text-center text-sm ${subtleText}`}>공매도 데이터를 가져올 수 없습니다. ({data.error})</div>
      ) : (
        <>
          <div className={`grid grid-cols-2 divide-x px-4 py-4 ${isDark ? "divide-white/10" : "divide-slate-200"}`}>
            <div className="text-center">
              <p className={`text-sm font-semibold ${subtleText} whitespace-nowrap`}>공매도 거래량</p>
              <p className="mt-2 font-mono text-2xl font-black whitespace-nowrap">{fmtShares(latestTrade?.shortVolume)}</p>
              <p className={`mt-1 text-xs ${subtleText} whitespace-nowrap`}>{fmtDate(latestTrade?.date)} 기준</p>
            </div>
            <div className="text-center">
              <p className={`text-sm font-semibold ${subtleText} whitespace-nowrap`}>공매도 잔고</p>
              <p className="mt-2 font-mono text-2xl font-black whitespace-nowrap">{fmtShares(latestBalance?.balanceVolume)}</p>
              <p className={`mt-1 text-xs ${subtleText} whitespace-nowrap`}>{fmtDate(latestBalance?.date)} 기준</p>
            </div>
          </div>

          <div className={`flex flex-wrap items-center gap-2 border-t px-4 py-3 ${borderClr}`}>
            <div className="flex gap-1">
              {(["volume", "balance"] as MetricKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetric(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    metric === key
                      ? isDark ? "bg-white text-slate-950" : "bg-slate-900 text-white"
                      : `${mutedBg} ${subtleText}`
                  }`}
                >
                  {key === "volume" ? "공매도 거래량" : "공매도 잔고"}
                </button>
              ))}
            </div>
            <div className={`ml-auto grid grid-cols-3 rounded-md p-0.5 ${mutedBg}`}>
              {RANGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  className={`rounded px-4 py-1 text-xs font-bold transition-colors ${
                    range === item.key ? isDark ? "bg-white text-slate-950" : "bg-white text-slate-900 shadow-sm" : subtleText
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={chartGestureRef}
            className="touch-pan-y select-none px-4 pb-4 pt-3"
            style={{
              touchAction: "pan-y",
              overscrollBehaviorX: "contain",
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseLeave={() => setHoveredRecord(null)}
          >
            <div
              className={`mb-3 flex min-h-9 items-center gap-3 rounded-md border px-3 py-2 text-xs ${
                isDark
                  ? "border-white/10 bg-white/5"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              {trackedRecord ? (
                <>
                  <span className={`font-mono font-bold ${subtleText}`}>
                    {fmtDate(trackedRecord.date)}
                  </span>
                  <span className="font-semibold">
                    {metric === "volume" ? "공매도 거래량" : "공매도 잔고"}
                  </span>
                  <span
                    className={`ml-auto font-mono text-sm font-black ${
                      metric === "volume"
                      ? isDark
                          ? "text-violet-300"
                          : "text-violet-700"
                        : isDark
                          ? "text-rose-300"
                          : "text-rose-700"
                    }`}
                  >
                    {fmtShares(metricValue(trackedRecord, metric))}
                  </span>
                </>
              ) : null}
            </div>
            <div className="flex h-56 items-end gap-1 border-b border-slate-300/50">
              {records.map((record) => {
                const value = metricValue(record, metric) ?? 0;
                const height = Math.max(2, (Math.abs(value) / maxValue) * 100);
                const active = hoveredRecord?.date === record.date;
                return (
                  <div
                    key={record.date}
                    className="flex h-full min-w-0 flex-1 cursor-crosshair flex-col items-center justify-end gap-1"
                    onMouseEnter={() => setHoveredRecord(record)}
                  >
                    <div
                      className={
                        metric === "volume"
                          ? `w-full max-w-4 rounded-t bg-violet-500 transition-all dark:bg-violet-400 ${
                              active
                                ? "scale-x-125 opacity-100"
                                : hoveredRecord
                                  ? "opacity-35"
                                  : "opacity-100"
                            }`
                          : `w-full max-w-4 rounded-t bg-rose-500 transition-all dark:bg-rose-400 ${
                              active
                                ? "scale-x-125 opacity-100"
                                : hoveredRecord
                                  ? "opacity-35"
                                  : "opacity-100"
                            }`
                      }
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className={`mt-2 flex justify-between font-mono text-xs font-semibold ${subtleText}`}>
              {records.filter((_, index) => records.length <= 8 || index % Math.ceil(records.length / 6) === 0).map((record) => (
                <span key={record.date}>{record.date.slice(5).replace("-", ".")}</span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
