"use client";

import type { YearlyFinancial } from "@/lib/api/company-analysis";
import { fmtEok, fmtPct, fmtValuation, fmtWon } from "./financial-utils";

type RowDef = {
  label:    string;
  key?:     keyof YearlyFinancial;
  val?:     (d: YearlyFinancial) => number | null;
  fmt:      (v: number | null) => string;
  color?:   (v: number | null) => string;
  section?: boolean;
};

const fmtRatio = (v: number | null) =>
  v == null ? "-" : `${v.toFixed(2)}배`;

const ROWS: RowDef[] = [
  // ── 손익계산서 ───────────────────────────────────────────────────
  { label: "매출액(억)",            key: "revenue",               fmt: fmtEok },
  { label: "매출총이익(억)",          key: "grossProfit",           fmt: fmtEok,       color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "영업이익(억)",           key: "operatingProfit",       fmt: fmtEok,       color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "당기순이익(억)",          key: "netIncome",             fmt: fmtEok,       color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "이자비용(억)",           key: "interestExpense",       fmt: fmtEok },
  { label: "매출총이익률(%)",         key: "grossMargin",           fmt: fmtPct,       section: true },
  { label: "영업이익률(%)",          key: "operatingMargin",       fmt: fmtPct },
  { label: "순이익률(%)",           key: "netIncomeMargin",       fmt: fmtPct },
  { label: "이자보상배율(배)",         key: "interestCoverageRatio", fmt: fmtRatio },
  // ── 재무상태표 ───────────────────────────────────────────────────
  { label: "자산총계(억)",           key: "totalAssets",           fmt: fmtEok,       section: true },
  { label: "유동자산(억)",           key: "currentAssets",         fmt: fmtEok },
  { label: "현금및현금성자산(억)",      key: "cashAndEquivalents",    fmt: fmtEok },
  { label: "매출채권(억)",           key: "accountsReceivable",    fmt: fmtEok },
  { label: "재고자산(억)",           key: "inventories",           fmt: fmtEok },
  { label: "비유동자산(억)",          key: "nonCurrentAssets",      fmt: fmtEok },
  { label: "유형자산(억)",           key: "tangibleAssets",        fmt: fmtEok },
  { label: "무형자산(억)",           key: "intangibleAssets",      fmt: fmtEok },
  { label: "부채총계(억)",           key: "totalLiabilities",      fmt: fmtEok,       section: true },
  { label: "유동부채(억)",           key: "currentLiabilities",    fmt: fmtEok },
  { label: "비유동부채(억)",          key: "nonCurrentLiabilities", fmt: fmtEok },
  { label: "단기차입금(억)",          key: "shortTermBorrowings",   fmt: fmtEok },
  { label: "장기차입금(억)",          key: "longTermBorrowings",    fmt: fmtEok },
  { label: "사채(억)",              key: "bonds",                 fmt: fmtEok },
  { label: "총차입금(억)",           key: "totalBorrowings",       fmt: fmtEok },
  { label: "순차입금(억)",           key: "netDebt",               fmt: fmtEok,       color: (v) => v != null && v < 0 ? "text-emerald-500" : "" },
  { label: "운전자본(억)",           key: "workingCapital",        fmt: fmtEok,       color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "자본총계(억)",           key: "totalEquity",           fmt: fmtEok,       section: true },
  { label: "자본금(억)",            key: "capitalAmount",         fmt: fmtEok },
  // ── 재무 비율 ────────────────────────────────────────────────────
  { label: "부채비율(%)",            key: "debtRatio",             fmt: fmtPct,       section: true },
  { label: "유동비율(%)",            key: "currentRatio",          fmt: fmtPct },
  { label: "순차입금비율(%)",          key: "netDebtRatio",          fmt: fmtPct,       color: (v) => v != null && v < 0 ? "text-emerald-500" : "" },
  { label: "자본유보율(%)",           key: "reserveRatio",          fmt: fmtPct },
  { label: "ROE(%)",               key: "roe",                   fmt: fmtPct },
  { label: "ROA(%)",               key: "roa",                   fmt: fmtPct },
  // ── 현금흐름 ─────────────────────────────────────────────────────
  { label: "영업활동현금흐름(억)",       key: "operatingCashFlow",     fmt: fmtEok,       section: true },
  { label: "투자활동현금흐름(억)",       key: "investingCashFlow",     fmt: fmtEok,       color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  { label: "재무활동현금흐름(억)",       key: "financingCashFlow",     fmt: fmtEok,       color: (v) => v != null && v < 0 ? "text-blue-500" : "" },
  // ── 주가 지표 ────────────────────────────────────────────────────
  { label: "PER(배)",              key: "per",                   fmt: fmtValuation,  section: true },
  { label: "PBR(배)",              key: "pbr",                   fmt: fmtValuation },
  { label: "PSR(배)",              key: "psr",                   fmt: fmtValuation },
  { label: "PCR(배)",              key: "pcr",                   fmt: fmtValuation },
  { label: "EPS(원)",              key: "eps",                   fmt: fmtWon,        section: true },
  { label: "BPS(원)",              key: "bps",                   fmt: fmtWon },
  { label: "SPS(원)",              key: "sps",                   fmt: fmtWon },
  { label: "CPS(원)",              key: "cps",                   fmt: fmtWon },
  // ── 배당 ─────────────────────────────────────────────────────────
  { label: "시가배당률(%)",           key: "dividendYield",         fmt: fmtPct,        section: true },
  { label: "배당성향(%)",            key: "dividendPayoutRatio",   fmt: fmtPct },
  { label: "주당배당금(원)",           key: "dividend",              fmt: fmtWon },
];

interface FinancialTableProps {
  data:      YearlyFinancial[];
  isDark:    boolean;
  subtleText: string;
}

export function FinancialTable({ data, isDark, subtleText }: FinancialTableProps) {
  const sorted = [...data].sort((a, b) => a.year - b.year);
  if (!sorted.length) return null;

  const borderRow     = isDark ? "border-white/10"  : "border-slate-100";
  const borderSection = isDark ? "border-t border-white/15" : "border-t border-slate-200";
  const hdrBg         = isDark ? "bg-slate-900"      : "bg-white";

  const getVal = (row: RowDef, d: YearlyFinancial): number | null =>
    row.val ? row.val(d) : (row.key ? (d[row.key] as number | null) : null);

  const visibleRows = ROWS.filter((row) => sorted.some((d) => getVal(row, d) != null));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className={hdrBg}>
            <th className={`sticky left-0 ${hdrBg} border-b px-6 py-3 text-left text-sm font-medium ${borderRow} ${subtleText}`}>
              항목
            </th>
            {sorted.map((d) => (
              <th key={d.year} className={`border-b px-6 py-3 text-right text-sm font-semibold ${borderRow}`}>
                {d.year}/12
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr
              key={row.label}
              className={`transition-colors hover:${isDark ? "bg-white/5" : "bg-slate-50"} ${row.section ? borderSection : ""}`}
            >
              <td className={`sticky left-0 ${isDark ? "bg-slate-900" : "bg-white"} border-b px-6 py-3 text-sm font-medium ${borderRow} ${subtleText}`}>
                {row.label}
              </td>
              {sorted.map((d) => {
                const raw = getVal(row, d);
                const clr = row.color ? row.color(raw) : "";
                return (
                  <td key={d.year}
                    className={`border-b px-6 py-3 text-right font-mono text-base font-semibold ${borderRow} ${
                      clr || (isDark ? "text-white/85" : "text-slate-900")
                    }`}>
                    {row.fmt(raw)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
