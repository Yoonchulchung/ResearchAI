import type { Candle, AnnotationType, ChartAnnotation } from "./types";

export function calcMA(data: Candle[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, d) => s + d.close, 0) / period;
  });
}

export function fmtPrice(v: number | null | undefined, currency: string | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(v);
}

export function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

export function fmtSigned(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}`;
}

export function fmtPct(v: number | null, dec = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

export function changePct(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round((((current - previous) / Math.abs(previous)) * 100) * 10) / 10;
}

export function fmtEok(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ko-KR")}억`;
}

export function fmtMarketCap(value: number | null, currency: string | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (currency !== "KRW") {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }

  const eok = Math.round(value / 100_000_000);
  const jo = Math.floor(eok / 10_000);
  const remainder = eok % 10_000;
  if (jo > 0) {
    return remainder > 0
      ? `${jo.toLocaleString("ko-KR")}조 ${remainder.toLocaleString("ko-KR")}억`
      : `${jo.toLocaleString("ko-KR")}조`;
  }
  return `${eok.toLocaleString("ko-KR")}억`;
}

export function avg(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function dateMs(value: string): number | null {
  const parsed = Date.parse(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function nearestCandleIndex(chart: Candle[], targetDate: string): number | null {
  const target = dateMs(targetDate);
  if (target == null || chart.length === 0) return null;
  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  chart.forEach((candle, idx) => {
    const current = dateMs(candle.date);
    if (current == null) return;
    const diff = Math.abs(current - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = idx;
    }
  });
  return bestDiff <= 1000 * 60 * 60 * 24 * 10 ? bestIdx : null;
}

export function markerColor(type: AnnotationType, severity: ChartAnnotation["severity"], isDark: boolean) {
  if (type === "risk" || severity === "danger") return isDark ? "#fb7185" : "#e11d48";
  if (severity === "warning") return isDark ? "#f59e0b" : "#d97706";
  if (type === "financial" || severity === "positive") return isDark ? "#34d399" : "#059669";
  if (type === "disclosure") return isDark ? "#a78bfa" : "#7c3aed";
  return isDark ? "#38bdf8" : "#0284c7";
}

export function typeLabel(type: AnnotationType) {
  return type === "news" ? "뉴스" : type === "disclosure" ? "공시" : type === "financial" ? "실적" : "리스크";
}
