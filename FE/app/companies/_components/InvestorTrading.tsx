"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { getCompanyInvestorTrading, type InvestorTradingData, type InvestorTradingRecord } from "@/lib/api/companies";

function fmtShares(value: number | null) {
  if (value == null) return "-";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString("ko-KR")}`;
}

function fmtTick(value: number) {
  if (value === 0) return "0 주";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}만 주`;
  return `${sign}${abs} 주`;
}

function netColor(value: number | null) {
  if (value == null || value === 0) return "text-slate-500 dark:text-white/40";
  return value > 0 ? "text-red-500" : "text-blue-500";
}

function fmtDate(value: string) {
  return value.replace(/-/g, ".") + ".";
}

function buildCumulative(records: InvestorTradingRecord[]) {
  let individual = 0;
  let foreign = 0;
  let institutional = 0;

  return [...records].reverse().map((record) => {
    individual += record.individual ?? 0;
    foreign += record.foreign ?? 0;
    institutional += record.institutional ?? 0;
    return {
      date: record.date,
      individual,
      foreign,
      institutional,
    };
  });
}

function InvestorTable({ records, subtleText }: {
  records: InvestorTradingRecord[];
  subtleText: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[390px] text-left text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-white/5">
            <th className={`px-3 py-2.5 font-semibold whitespace-nowrap ${subtleText}`}>날짜</th>
            <th className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${subtleText}`}>개인</th>
            <th className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${subtleText}`}>기관</th>
            <th className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${subtleText}`}>외인</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-mono dark:divide-white/5">
          {records.map((record) => (
            <tr key={record.date} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
              <td className="px-3 py-3.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtDate(record.date)}</td>
              <td className={`px-3 py-3.5 text-right font-bold whitespace-nowrap ${netColor(record.individual)}`}>{fmtShares(record.individual)}</td>
              <td className={`px-3 py-3.5 text-right font-bold whitespace-nowrap ${netColor(record.institutional)}`}>{fmtShares(record.institutional)}</td>
              <td className={`px-3 py-3.5 text-right font-bold whitespace-nowrap ${netColor(record.foreign)}`}>{fmtShares(record.foreign)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestorDetailModal({
  data,
  isDark,
  subtleText,
  onClose,
}: {
  data: InvestorTradingData;
  isDark: boolean;
  subtleText: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");
  const [range, setRange] = useState<"1m" | "3m" | "6m" | "12m">("1m");
  const [showChart, setShowChart] = useState(true);
  const [page, setPage] = useState(1);

  const rangeLimit = range === "1m" ? 30 : range === "3m" ? 90 : range === "6m" ? 180 : 365;
  const dailyRecords = data.records.slice(0, 30);
  const filteredDaily = data.records.slice(0, rangeLimit);
  const cumulativeRecords = useMemo(() => buildCumulative(filteredDaily), [filteredDaily]);
  const cumulativeNewestFirst = useMemo(() => [...cumulativeRecords].reverse(), [cumulativeRecords]);
  const recordsToPaginate = mode === "daily" ? dailyRecords : cumulativeNewestFirst;
  const totalPages = Math.max(1, Math.ceil(recordsToPaginate.length / 8));
  const currentPageRecords = recordsToPaginate.slice((page - 1) * 8, page * 8);
  const summaryRecord = mode === "daily"
    ? currentPageRecords[0] ?? null
    : cumulativeRecords[cumulativeRecords.length - 1] ?? null;
  const chartData = mode === "daily" ? [...currentPageRecords].reverse() : cumulativeRecords;
  const values = chartData.flatMap((item) => [item.individual ?? 0, item.foreign ?? 0, item.institutional ?? 0]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const domain = [min * 1.15, max * 1.15];
  const ticks = [min, 0, max];
  const borderClr = isDark ? "border-white/10" : "border-slate-200";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={`flex max-h-[86dvh] w-full max-w-4xl flex-col overflow-hidden rounded-md border ${
          isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-center justify-between border-b px-5 py-4 ${borderClr}`}>
          <div>
            <h3 className="text-lg font-bold">투자자별 매매동향 자세히 보기</h3>
            <p className={`mt-1 text-xs ${subtleText}`}>{data.source} · {data.records.length}일 데이터</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-3 ${borderClr}`}>
            <div className="flex gap-1.5">
              {(["daily", "cumulative"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setMode(key); setPage(1); }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    mode === key
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60"
                  }`}
                >
                  {key === "daily" ? "순매수" : "누적 순매수"}
                </button>
              ))}
            </div>
            {mode === "cumulative" && (
              <div className="flex gap-1">
                {([
                  { key: "1m", label: "1개월" },
                  { key: "3m", label: "3개월" },
                  { key: "6m", label: "6개월" },
                  { key: "12m", label: "12개월" },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => { setRange(item.key); setPage(1); }}
                    className={`rounded px-3 py-1 text-xs font-bold ${
                      range === item.key ? "bg-indigo-600 text-white" : "text-slate-500 dark:text-white/60"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowChart((value) => !value)}
              className={`ml-auto rounded-md px-3 py-1.5 text-xs font-bold ${
                showChart ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60"
              }`}
            >
              차트 {showChart ? "ON" : "OFF"}
            </button>
          </div>

          {showChart && (
            <div className="px-5 py-4">
              {summaryRecord && (
                <div className={`mb-4 grid grid-cols-3 divide-x rounded-md border py-3 ${isDark ? "divide-white/10 border-white/5 bg-white/5" : "divide-slate-100 border-slate-100 bg-slate-50"}`}>
                  {[
                    ["개인", summaryRecord.individual],
                    ["기관", summaryRecord.institutional],
                    ["외인", summaryRecord.foreign],
                  ].map(([label, value]) => (
                    <div key={label as string} className="text-center">
                      <span className={`text-xs ${subtleText}`}>{label}</span>
                      <p className={`text-sm font-bold ${netColor(value as number | null)}`}>{fmtShares(value as number | null)}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {mode === "daily" ? (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }} barGap={0}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"} />
                      <XAxis dataKey="date" tickFormatter={(date) => date.slice(2).replace(/-/g, ".") + "."} tick={{ fontSize: 9, fill: isDark ? "rgba(255,255,255,0.4)" : "#64748b" }} />
                      <YAxis tickFormatter={fmtTick} ticks={ticks} domain={domain} tick={{ fontSize: 9, fill: isDark ? "rgba(255,255,255,0.4)" : "#64748b" }} width={65} />
                      <ReferenceLine y={0} stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"} />
                      <Bar dataKey="individual" fill={isDark ? "#ffffff" : "#222222"} maxBarSize={14} />
                      <Bar dataKey="institutional" fill="#3b82f6" maxBarSize={14} />
                      <Bar dataKey="foreign" fill="#ef4444" maxBarSize={14} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"} />
                      <XAxis dataKey="date" tickFormatter={(date) => date.slice(2).replace(/-/g, ".") + "."} tick={{ fontSize: 9, fill: isDark ? "rgba(255,255,255,0.4)" : "#64748b" }} />
                      <YAxis tickFormatter={fmtTick} ticks={ticks} domain={domain} tick={{ fontSize: 9, fill: isDark ? "rgba(255,255,255,0.4)" : "#64748b" }} width={65} />
                      <ReferenceLine y={0} stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"} />
                      <Line type="monotone" dataKey="individual" stroke={isDark ? "#ffffff" : "#222222"} strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="institutional" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="foreign" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <InvestorTable records={currentPageRecords} subtleText={subtleText} />
        </div>

        {totalPages > 1 && (
          <div className={`flex items-center justify-center gap-3 border-t py-3 ${borderClr}`}>
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="p-1 text-slate-400 disabled:opacity-30">&lt;</button>
            <span className={`text-xs font-bold ${subtleText}`}>{page} / {totalPages}</span>
            <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="p-1 text-slate-400 disabled:opacity-30">&gt;</button>
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  companyId: string;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

export function InvestorTrading({ companyId, isDark, panelClass, subtleText }: Props) {
  const [data, setData] = useState<InvestorTradingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetailOpen(false);
    getCompanyInvestorTrading(companyId, 30)
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { if (!cancelled) setData({ stockCode: null, records: [], source: "KRX", error: "불러오기 실패" }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const previewRecords = data?.records.slice(0, 3) ?? [];
  const borderClr = isDark ? "border-white/10" : "border-slate-200";

  return (
    <div className={`rounded-md border overflow-hidden ${panelClass}`}>
      <div className={`flex items-center justify-between border-b px-4 py-3 ${borderClr}`}>
        <div>
          <h3 className="text-base font-bold">투자자별 매매동향</h3>
          <p className={`mt-0.5 text-xs ${subtleText}`}>{data?.source ?? "KRX"} · 최신 3일</p>
        </div>
        {data && data.records.length > 3 && (
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
              isDark ? "bg-white/10 text-white/70 hover:bg-white/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            자세히 보기
          </button>
        )}
      </div>

      {loading ? (
        <div className={`px-4 py-8 text-center text-sm ${subtleText}`}>데이터를 불러오는 중...</div>
      ) : data?.error && !data.records.length ? (
        <div className={`px-4 py-8 text-center text-sm ${subtleText}`}>{data.error}</div>
      ) : previewRecords.length ? (
        <InvestorTable records={previewRecords} subtleText={subtleText} />
      ) : (
        <div className={`px-4 py-8 text-center text-sm ${subtleText}`}>표시할 데이터가 없습니다.</div>
      )}

      {detailOpen && data && (
        <InvestorDetailModal
          data={data}
          isDark={isDark}
          subtleText={subtleText}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}
