import type { YearlyFinancial } from "@/lib/api/company-analysis";

export type PerformanceMetricKey = "revenue" | "operatingProfit" | "netIncome";
export type PerformanceMode = "annual" | "quarter";
export type PerformanceRecord = YearlyFinancial & {
  quarter?:     number;
  periodLabel?: string;
  basisLabel?:  string;
};

export const PERFORMANCE_METRICS: { key: PerformanceMetricKey; label: string; summaryLabel: string }[] = [
  { key: "revenue",         label: "매출액",  summaryLabel: "최근 매출액"  },
  { key: "operatingProfit", label: "영업이익", summaryLabel: "최근 영업이익" },
  { key: "netIncome",       label: "순이익",  summaryLabel: "최근 순이익"  },
];

export function fmtEok(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("ko-KR");
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? v.toLocaleString("ko-KR") : v.toFixed(2);
}

export function fmtWon(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? v.toLocaleString("ko-KR") : v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function fmtValuation(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? v.toLocaleString("ko-KR") : v.toFixed(2);
}

export function fmtKoreanEok(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v < 0 ? "-" : "";
  const totalMan = Math.round(Math.abs(v) * 10_000);
  const jo  = Math.floor(totalMan / 100_000_000);
  const eok = Math.floor((totalMan % 100_000_000) / 10_000);
  const man = totalMan % 10_000;
  if (jo > 0) return eok > 0 ? `${sign}${jo}조 ${eok.toLocaleString("ko-KR")}억` : `${sign}${jo}조`;
  if (eok > 0) return man > 0 ? `${sign}${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만` : `${sign}${eok.toLocaleString("ko-KR")}억`;
  return `${sign}${man.toLocaleString("ko-KR")}만`;
}

// y축 틱 전용 — 축 공간이 좁으므로 짧게 포맷 (1억 단위 입력)
export function fmtYTick(v: number): string {
  const abs  = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}조`;
  if (abs >= 1_000)  return `${sign}${(abs / 1_000).toFixed(1)}천억`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}억`;
}

export function fmtSignedPct(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function comparePct(
  current:  number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function performanceBasisLabel(latest: PerformanceRecord | null): string {
  return latest?.basisLabel ?? (latest ? `${latest.year}. 12. 기준` : "");
}

export function findComparisonRecord(
  sorted: PerformanceRecord[],
  latest: PerformanceRecord,
  mode:   PerformanceMode,
): PerformanceRecord | null {
  if (mode === "quarter" && latest.quarter != null) {
    return sorted.find((d) => d.year === latest.year - 1 && d.quarter === latest.quarter) ?? null;
  }
  return sorted.at(-2) ?? null;
}

export function findPreviousQuarterRecord(
  sorted: PerformanceRecord[],
  current: PerformanceRecord,
): PerformanceRecord | null {
  if (current.quarter == null) return null;
  const previousYear = current.quarter === 1 ? current.year - 1 : current.year;
  const previousQuarter = current.quarter === 1 ? 4 : current.quarter - 1;
  return sorted.find((d) => d.year === previousYear && d.quarter === previousQuarter) ?? null;
}

export function toAnnualPerformanceData(data: YearlyFinancial[]): PerformanceRecord[] {
  return data.map((d) => ({
    ...d,
    periodLabel: `${d.year}.12.`,
    basisLabel:  `${d.year}. 12. 기준`,
  }));
}

function calcRatio(
  numerator:   number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return round2((numerator / denominator) * 100);
}

function calcPerShare(
  eokValue: number | null | undefined,
  shares:   number | null,
): number | null {
  if (eokValue == null || !shares) return null;
  return round2((eokValue * 100_000_000) / shares);
}

function inferSharesFromBps(d: YearlyFinancial): number | null {
  if (d.totalEquity == null || d.bps == null || d.bps === 0) return null;
  const shares = (d.totalEquity * 100_000_000) / d.bps;
  return Number.isFinite(shares) && shares > 0 ? shares : null;
}

export function deriveFinancialData(
  data:        YearlyFinancial[],
  marketPrice: number | null,
): YearlyFinancial[] {
  const sorted     = [...data].sort((a, b) => a.year - b.year);
  const latestYear = sorted.at(-1)?.year ?? null;
  const fallbackShares =
    sorted.map(inferSharesFromBps).find((s): s is number => s != null) ?? null;

  return sorted.map((d, i) => {
    const prev   = sorted[i - 1] ?? null;
    const shares = inferSharesFromBps(d) ?? fallbackShares;
    const next: YearlyFinancial = { ...d };

    next.operatingMargin  ??= calcRatio(next.operatingProfit, next.revenue);
    next.netIncomeMargin  ??= calcRatio(next.netIncome,       next.revenue);
    next.debtRatio        ??= calcRatio(next.totalLiabilities, next.totalEquity);
    next.currentRatio     ??= calcRatio(next.currentAssets,   next.currentLiabilities);

    if (next.reserveRatio == null && next.totalEquity != null && next.capitalAmount != null && next.capitalAmount !== 0) {
      next.reserveRatio = round2(((next.totalEquity - next.capitalAmount) / next.capitalAmount) * 100);
    }
    if (next.roa == null && next.netIncome != null && next.totalAssets != null) {
      const avgAssets = prev?.totalAssets != null ? (prev.totalAssets + next.totalAssets) / 2 : next.totalAssets;
      next.roa = calcRatio(next.netIncome, avgAssets);
    }
    if (next.roe == null && next.netIncome != null && next.totalEquity != null) {
      const avgEquity = prev?.totalEquity != null ? (prev.totalEquity + next.totalEquity) / 2 : next.totalEquity;
      next.roe = calcRatio(next.netIncome, avgEquity);
    }

    next.eps ??= calcPerShare(next.netIncome,        shares);
    next.bps ??= calcPerShare(next.totalEquity,      shares);
    next.sps ??= calcPerShare(next.revenue,           shares);
    next.cps ??= calcPerShare(next.operatingCashFlow, shares);

    if (marketPrice != null && latestYear != null && next.year === latestYear) {
      if (next.eps != null && next.eps !== 0)           next.per = round2(marketPrice / next.eps);
      if (next.pbr == null && next.bps != null && next.bps !== 0) next.pbr = round2(marketPrice / next.bps);
      if (next.psr == null && next.sps != null && next.sps !== 0) next.psr = round2(marketPrice / next.sps);
      if (next.pcr == null && next.cps != null && next.cps !== 0) next.pcr = round2(marketPrice / next.cps);
      if (next.dividendYield == null && next.dividend != null && marketPrice !== 0) {
        next.dividendYield = round2((next.dividend / marketPrice) * 100);
      }
    }
    if (next.dividendPayoutRatio == null && next.dividend != null && next.eps != null && next.eps !== 0) {
      next.dividendPayoutRatio = round2((next.dividend / next.eps) * 100);
    }

    return next;
  });
}
