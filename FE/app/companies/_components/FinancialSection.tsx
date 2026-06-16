"use client";

import { useState } from "react";
import type { YearlyFinancial } from "@/lib/api/company-analysis";

/* ── 헬퍼 ─────────────────────────────────────────────────── */

function fmtEok(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}조`;
  return `${sign}${abs.toLocaleString("ko-KR")}억`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

/* ── 도넛 차트 ────────────────────────────────────────────── */

interface DonutProps {
  latest: YearlyFinancial;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

function AssetDonutChart({ latest, isDark, panelClass, subtleText }: DonutProps) {
  const assets = latest.totalAssets;
  const equity = latest.totalEquity;
  const liab   = latest.totalLiabilities;

  if (!assets || (!equity && !liab)) return null;

  const equityRatio = equity && assets ? (equity / assets) * 100 : 0;
  const liabRatio   = 100 - equityRatio;

  /* SVG 도넛 (r=70, cx/cy=90) */
  const R  = 70;
  const cx = 90;
  const cy = 90;
  const circumference = 2 * Math.PI * R;
  const equityDash = (equityRatio / 100) * circumference;
  const liabDash   = (liabRatio / 100) * circumference;

  /* equity arc first (starts at -90deg = top) */
  return (
    <div className={`rounded-md border p-4 ${panelClass}`}>
      <h3 className="mb-3 text-sm font-bold">자산비율</h3>
      <div className="flex items-center gap-6">
        {/* 도넛 */}
        <svg width={180} height={180} viewBox="0 0 180 180" className="shrink-0">
          {/* 배경 */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9"} strokeWidth={22} />
          {/* 부채 (파랑) — 전체를 먼저 깔고 */}
          <circle
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={isDark ? "#3b82f6" : "#60a5fa"}
            strokeWidth={22}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
          {/* 자본 (빨강) — 위에 덮음 */}
          <circle
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={isDark ? "#ef4444" : "#f87171"}
            strokeWidth={22}
            strokeDasharray={`${equityDash.toFixed(1)} ${circumference}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
          {/* 중앙 텍스트 */}
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize={10} fill={isDark ? "rgba(255,255,255,0.45)" : "#94a3b8"} fontFamily="sans-serif">
            자산총계
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={13} fontWeight="bold" fill={isDark ? "white" : "#1e293b"} fontFamily="monospace">
            {fmtEok(assets)}
          </text>
          {latest.year && (
            <text x={cx} y={cy + 26} textAnchor="middle" fontSize={9} fill={isDark ? "rgba(255,255,255,0.3)" : "#94a3b8"} fontFamily="sans-serif">
              {latest.year}년
            </text>
          )}
        </svg>

        {/* 범례 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: isDark ? "#ef4444" : "#f87171" }} />
            <div>
              <p className="text-sm font-semibold">자본비중</p>
              <p className={`text-xs ${subtleText}`}>{fmtEok(equity)}</p>
            </div>
            <span className="ml-auto pl-4 font-mono text-sm font-bold">{equityRatio.toFixed(2)}%</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: isDark ? "#3b82f6" : "#60a5fa" }} />
            <div>
              <p className="text-sm font-semibold">부채비중</p>
              <p className={`text-xs ${subtleText}`}>{fmtEok(liab)}</p>
            </div>
            <span className="ml-auto pl-4 font-mono text-sm font-bold">{liabRatio.toFixed(2)}%</span>
          </div>
          {latest.debtRatio != null && (
            <div className={`rounded border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"}`}>
              <span className={subtleText}>부채비율</span>{" "}
              <span className="font-mono font-bold">{fmtPct(latest.debtRatio)}</span>
            </div>
          )}
          {latest.currentRatio != null && (
            <div className={`rounded border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"}`}>
              <span className={subtleText}>유동비율</span>{" "}
              <span className="font-mono font-bold">{fmtPct(latest.currentRatio)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 재무 테이블 ───────────────────────────────────────────── */

interface TableProps {
  data: YearlyFinancial[];
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

type RowDef = {
  label: string;
  key: keyof YearlyFinancial;
  fmt: (v: number | null) => string;
  color?: (v: number | null) => string;
  section?: boolean; // 구분선 위
};

const ROWS: RowDef[] = [
  { label: "매출액(억)",         key: "revenue",            fmt: fmtEok },
  { label: "영업이익(억)",       key: "operatingProfit",    fmt: fmtEok, color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "당기순이익(억)",     key: "netIncome",          fmt: fmtEok, color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "영업이익률(%)",      key: "operatingMargin",    fmt: fmtPct, section: true },
  { label: "순이익률(%)",        key: "netIncomeMargin",    fmt: fmtPct },
  { label: "자산총계(억)",       key: "totalAssets",        fmt: fmtEok, section: true },
  { label: "부채총계(억)",       key: "totalLiabilities",  fmt: fmtEok },
  { label: "자본총계(억)",       key: "totalEquity",        fmt: fmtEok },
  { label: "자본금(억)",         key: "capitalAmount",      fmt: fmtEok },
  { label: "부채비율(%)",        key: "debtRatio",          fmt: fmtPct, section: true },
  { label: "유동비율(%)",        key: "currentRatio",       fmt: fmtPct },
  { label: "영업활동현금흐름(억)", key: "operatingCashFlow", fmt: fmtEok, section: true },
  { label: "투자활동현금흐름(억)", key: "investingCashFlow", fmt: fmtEok, color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "재무활동현금흐름(억)", key: "financingCashFlow", fmt: fmtEok, color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
];

function FinancialTable({ data, isDark, panelClass, subtleText }: TableProps) {
  const sorted = [...data].sort((a, b) => a.year - b.year);
  if (!sorted.length) return null;

  const borderRow = isDark ? "border-white/10" : "border-slate-100";
  const borderSection = isDark ? "border-t border-white/20" : "border-t border-slate-200";
  const hdrBg = isDark ? "bg-white/5" : "bg-slate-50";

  return (
    <div className={`rounded-md border overflow-hidden ${panelClass}`}>
      <div className={`border-b px-4 py-2.5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <h3 className="text-sm font-bold">연간 재무 데이터</h3>
        <p className={`mt-0.5 text-xs ${subtleText}`}>DART 공시 기준 (억원)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className={`${hdrBg}`}>
              <th className={`sticky left-0 ${hdrBg} border-b border-r px-3 py-2 text-left font-semibold ${borderRow} ${subtleText}`}>
                항목
              </th>
              {sorted.map((d) => (
                <th key={d.year} className={`border-b px-4 py-2 text-right font-bold ${borderRow}`}>
                  {d.year}/12
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              /* 모든 연도가 null이면 행 숨김 */
              const hasAny = sorted.some((d) => d[row.key] != null);
              if (!hasAny) return null;

              return (
                <tr
                  key={row.label}
                  className={`transition-colors hover:${isDark ? "bg-white/5" : "bg-slate-50"} ${row.section ? borderSection : ""}`}
                >
                  <td className={`sticky left-0 ${isDark ? "bg-slate-900" : "bg-white"} border-b border-r px-3 py-1.5 font-medium ${borderRow} ${subtleText}`}>
                    {row.label}
                  </td>
                  {sorted.map((d) => {
                    const raw = d[row.key] as number | null;
                    const str = row.fmt(raw);
                    const clr = row.color ? row.color(raw) : "";
                    return (
                      <td
                        key={d.year}
                        className={`border-b px-4 py-1.5 text-right font-mono font-bold ${borderRow} ${clr || (isDark ? "text-white/80" : "text-slate-800")}`}
                      >
                        {str}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 메인 섹션 ────────────────────────────────────────────── */

interface FinancialSectionProps {
  data: YearlyFinancial[];
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

export function FinancialSection({ data, isDark, panelClass, subtleText }: FinancialSectionProps) {
  const [_tab, _setTab] = useState<"annual">("annual"); // 분기 데이터 미지원 (DART 분기보고서 별도 API 필요)

  const sorted = [...data].sort((a, b) => b.year - a.year);
  const latest = sorted[0];

  if (!data.length) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* 도넛 차트 — 최신 연도 기준 */}
      {latest && (latest.totalAssets || latest.totalEquity || latest.totalLiabilities) ? (
        <AssetDonutChart latest={latest} isDark={isDark} panelClass={panelClass} subtleText={subtleText} />
      ) : null}

      {/* 연간 재무 테이블 */}
      <FinancialTable data={data} isDark={isDark} panelClass={panelClass} subtleText={subtleText} />
    </div>
  );
}
