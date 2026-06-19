import type { IntervalKey } from "./types";

export const INTERVALS = [
  { key: "15m", label: "15분" },
  { key: "1h",  label: "1시간" },
  { key: "4h",  label: "4시간" },
  { key: "1d",  label: "1일" },
  { key: "1w",  label: "1주" },
] as const;

export const CHART_TYPES = [
  { key: "candlestick", label: "캔들" },
  { key: "line",        label: "라인" },
  { key: "area",        label: "영역" },
  { key: "bars",        label: "바" },
] as const;

export const WINDOW_SIZE     = 80;  // 기본 윈도우 크기
export const WINDOW_SIZE_MIN = 20;  // 최대 확대
export const WINDOW_SIZE_MAX = 5000; // 최대 축소 (무한 스크롤 패치 허용)

/* ── SVG 레이아웃 관련 고정 상수 ───────────────── */
export const GAP   = 16;
export const PAD_L = 4;
export const PAD_R = 68;    // y축 레이블 공간
export const PAD_T = 14;
export const PAD_B = 26;
export const LOAD_MORE_INTERVALS = new Set<IntervalKey>(["15m", "1h", "4h", "1d"]);
