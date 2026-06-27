"use client";

import { useEffect, useState } from "react";
import { getStockInfo, type StockInfo } from "@/lib/api/stock";

interface CompanyInfoSidebarProps {
  symbol: string;
  isDark: boolean;
}

type Tab = "info" | "metrics" | "ai";

function fmt(v: number | null, digits = 0) {
  if (v == null) return "-";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits }).format(v);
}

function fmtCompact(v: number | null, currency?: string): string {
  if (v == null) return "-";
  const prefix = currency === "USD" ? "$" : "";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}${prefix}${(abs / 1_000_000_000_000).toFixed(1)}조`;
  if (abs >= 100_000_000)       return `${sign}${prefix}${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 1_000_000)         return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}백만`;
  return `${sign}${prefix}${fmt(abs)}`;
}

function fmtPct(v: number | null) {
  if (v == null) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-2 border-b border-slate-100/50 dark:border-slate-800/40 last:border-0">
      <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`min-w-0 truncate text-right font-mono text-xs font-semibold ${color ?? "text-slate-800 dark:text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

function Divider({ isDark }: { isDark: boolean }) {
  return <div className={`my-2 h-px ${isDark ? "bg-slate-800" : "bg-slate-100"}`} />;
}

export function CompanyInfoSidebar({ symbol, isDark }: CompanyInfoSidebarProps) {
  const [tab, setTab] = useState<Tab>("info");
  const [info, setInfo] = useState<StockInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setInfo(null);
    getStockInfo(symbol)
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  const border = isDark ? "border-slate-800" : "border-slate-200/80";
  const bg = isDark ? "bg-slate-900" : "bg-white";
  const tabBorder = isDark ? "border-slate-800" : "border-slate-200/80";
  const activeCls = isDark
    ? "border-b-2 border-indigo-400 text-indigo-350 font-bold"
    : "border-b-2 border-indigo-600 text-indigo-700 font-bold";
  const inactiveCls = isDark
    ? "border-b-2 border-transparent text-slate-500 hover:text-slate-300"
    : "border-b-2 border-transparent text-slate-400 hover:text-slate-700";

  const TABS: { key: Tab; label: string }[] = [
    { key: "info", label: "종목정보" },
    { key: "metrics", label: "지표분석" },
    { key: "ai", label: "AI예측" },
  ];

  const currency = info?.currency ?? "USD";

  return (
    <aside
      className={`flex h-full w-64 shrink-0 flex-col overflow-hidden rounded-2xl border ${border} ${bg} shadow-sm`}
    >
      {/* 탭 헤더 */}
      <div className={`flex shrink-0 border-b ${tabBorder}`}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-xs font-semibold tracking-wide transition-all duration-200 ${tab === t.key ? activeCls : inactiveCls}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`h-4 animate-pulse rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
                style={{ width: `${60 + (i % 3) * 15}%` }}
              />
            ))}
          </div>
        ) : !info ? (
          <div className="flex h-32 items-center justify-center text-xs text-slate-400">
            데이터를 불러올 수 없습니다.
          </div>
        ) : tab === "info" ? (
          <div className="p-4">
            {/* 기업명 */}
            <div className="mb-3">
              <p className={`text-sm font-bold leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                {info.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {info.exchange} · {info.symbol.replace(/\.(KS|KQ)$/, "")}
              </p>
            </div>

            {/* 업종 태그 */}
            {(info.sector ?? info.industry) && (
              <div className="mb-3 flex flex-wrap gap-1">
                {[info.sector, info.industry]
                  .filter(Boolean)
                  .map((tag) => (
                    <span
                      key={tag}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        isDark
                          ? "border-slate-700 text-slate-400"
                          : "border-slate-200 text-slate-500"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            )}

            <Divider isDark={isDark} />

            {/* 핵심 지표 */}
            <StatRow label="시가총액" value={fmtCompact(info.marketCap, currency)} />
            <StatRow label="주식수" value={info.sharesOutstanding != null ? fmt(info.sharesOutstanding) + "주" : "-"} />
            {info.employees != null && (
              <StatRow label="임직원" value={fmt(info.employees) + "명"} />
            )}
            <StatRow
              label="52주 최고"
              value={info.week52High != null ? (currency === "KRW" ? fmt(info.week52High) : `$${info.week52High.toFixed(2)}`) : "-"}
              color="text-rose-500"
            />
            <StatRow
              label="52주 최저"
              value={info.week52Low != null ? (currency === "KRW" ? fmt(info.week52Low) : `$${info.week52Low.toFixed(2)}`) : "-"}
              color="text-sky-500"
            />
            {info.foreignOwnershipPct != null && (
              <StatRow label="기관 보유비중" value={`${info.foreignOwnershipPct.toFixed(2)}%`} />
            )}

            <Divider isDark={isDark} />

            {/* 기업개요 */}
            {info.description && (
              <div className="mt-2">
                <p className={`mb-1.5 text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  기업개요
                </p>
                <ExpandableText text={info.description} isDark={isDark} />
              </div>
            )}

            <Divider isDark={isDark} />

            {/* 실적 */}
            <p className={`mb-2 mt-2 text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              최근 실적
            </p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {[
                { label: "매출", value: fmtCompact(info.revenue, currency), growth: info.revenueGrowth },
                { label: "영업이익", value: fmtCompact(info.operatingIncome, currency), growth: null },
                { label: "순이익", value: fmtCompact(info.netIncome, currency), growth: null },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-lg p-2 ${isDark ? "bg-slate-800/60" : "bg-slate-50"}`}
                >
                  <p className="text-[10px] text-slate-400">{item.label}</p>
                  <p className={`mt-0.5 text-xs font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                    {item.value}
                  </p>
                  {item.growth != null && (
                    <p className={`text-[10px] font-semibold ${item.growth >= 0 ? "text-rose-500" : "text-sky-500"}`}>
                      {fmtPct(item.growth * 100)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : tab === "metrics" ? (
          <div className="p-4">
            <p className={`mb-2 text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              밸류에이션
            </p>
            <StatRow label="PER (주가수익비율)" value={info.pe != null ? `${info.pe.toFixed(1)}x` : "-"} />
            <StatRow label="PBR (주가순자산비율)" value={info.pb != null ? `${info.pb.toFixed(1)}x` : "-"} />
            <StatRow label="EPS (주당순이익)" value={info.eps != null ? (currency === "KRW" ? `${fmt(info.eps)}원` : `$${info.eps.toFixed(2)}`) : "-"} />

            <Divider isDark={isDark} />

            <p className={`mb-2 mt-2 text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              수익성
            </p>
            <StatRow label="ROE (자기자본이익률)" value={info.roe != null ? `${info.roe.toFixed(1)}%` : "-"} />
            <StatRow label="매출 성장률" value={info.revenueGrowth != null ? fmtPct(info.revenueGrowth * 100) : "-"} />

            <Divider isDark={isDark} />

            <p className={`mb-2 mt-2 text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              재무
            </p>
            <StatRow label="매출액" value={fmtCompact(info.revenue, currency)} />
            <StatRow label="영업이익" value={fmtCompact(info.operatingIncome, currency)} />
            <StatRow label="순이익" value={fmtCompact(info.netIncome, currency)} />
            <StatRow label="시가총액" value={fmtCompact(info.marketCap, currency)} />
          </div>
        ) : (
          /* AI 예측 탭 */
          <div className="flex flex-col gap-3 p-4">
            <div className={`rounded-xl p-3 ${isDark ? "bg-indigo-950/50 border border-indigo-800/40" : "bg-indigo-50 border border-indigo-100"}`}>
              <p className={`text-xs font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
                AI 분석 준비 중
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-indigo-400" : "text-indigo-500"}`}>
                {info.name}의 재무 데이터와 시장 트렌드를 기반으로 한 AI 예측이 곧 제공될 예정입니다.
              </p>
            </div>
            {info.revenueGrowth != null && (
              <div className={`rounded-xl p-3 ${isDark ? "bg-slate-800/60" : "bg-slate-50"}`}>
                <p className="text-xs font-semibold text-slate-400">매출 성장률 (YoY)</p>
                <p className={`mt-1 text-lg font-black ${info.revenueGrowth >= 0 ? "text-rose-500" : "text-sky-500"}`}>
                  {fmtPct(info.revenueGrowth * 100)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function ExpandableText({ text, isDark }: { text: string; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const limit = 120;
  const short = text.length > limit;

  return (
    <div>
      <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {expanded || !short ? text : text.slice(0, limit) + "…"}
      </p>
      {short && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-indigo-500 hover:text-indigo-400"
        >
          {expanded ? "접기" : "더 보기"}
        </button>
      )}
    </div>
  );
}
