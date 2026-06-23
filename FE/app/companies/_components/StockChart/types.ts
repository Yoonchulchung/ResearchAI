import type {
  CompanyStockQuote,
  CompanyTimelineEvent,
} from "@/lib/api/companies";

export type IntervalKey = "15m" | "1h" | "4h" | "1d" | "1w";
export type ChartType = "candlestick" | "line" | "area" | "bars";
export type Candle = CompanyStockQuote["chart"][number];
export type AnnotationType = "news" | "disclosure" | "financial" | "risk";
export interface FinancialAnnotationMetric {
  key: "revenue" | "operatingProfit" | "netIncome";
  label: string;
  value: number | null;
  comparisons: {
    label: string;
    value: number | null;
  }[];
}

export type ChartAnnotation = CompanyTimelineEvent & {
  financialDetails?: {
    periodLabel: string;
    metrics: FinancialAnnotationMetric[];
  };
};

/* ── 보조지표 타입 ────────────────────────────────────── */
export type ChartOverlayId =
  | "ma"
  | "bb"
  | "ichimoku"
  | "sar"
  | "envelope"
  | "priceChannel"
  | "vwap";

export type SubPanelId =
  | "volume"
  | "tradingValue"
  | "macd"
  | "stochFast"
  | "stochSlow"
  | "rsi"
  | "cci"
  | "momentum"
  | "disparity"
  | "volumeRatio"
  | "roc"
  | "adLine"
  | "atr"
  | "cmf"
  | "mfi"
  | "obv"
  | "psychLine"
  | "sonar"
  | "chaikinVol"
  | "chaikinOsc"
  | "trix"
  | "williamsR"
  | "adx"
  | "aroon"
  | "aroonOsc"
  | "elderBull"
  | "elderBear"
  | "stochRsi"
  | "massIndex"
  | "pvi"
  | "nvi"
  | "eom"
  | "ultimateOsc"
  | "pvo"
  | "ppo"
  | "forceIndex";

export type IndicatorId = ChartOverlayId | SubPanelId;

export interface SubPanelLine {
  values: (number | null)[];
  color: string;
  label: string;
  width?: number;
}

export interface SubPanelHistBar {
  values: (number | null)[];
  posColor: string;
  negColor: string;
}

export interface SubPanelLevel {
  value: number;
  color: string;
  dash?: string;
}

export interface SubPanelData {
  id: SubPanelId;
  label: string;
  lines: SubPanelLine[];
  histBars?: SubPanelHistBar;
  levels?: SubPanelLevel[];
  valueRange?: [number, number];
}

export interface OverlayBand {
  upper: (number | null)[];
  lower: (number | null)[];
  middle?: (number | null)[];
  color: string;
  fillOpacity?: number;
}

export interface ChartOverlays {
  bb?: OverlayBand;
  sar?: (number | null)[];
  ichimoku?: {
    tenkan: (number | null)[];
    kijun: (number | null)[];
    senkouA: (number | null)[];
    senkouB: (number | null)[];
  };
  envelope?: OverlayBand;
  priceChannel?: OverlayBand;
  vwap?: (number | null)[];
}

export interface ChartProps {
  containerSize: { w: number; h: number };
  chart: Candle[];
  ma7: (number | null)[];
  ma25: (number | null)[];
  annotations: ChartAnnotation[];
  isUp: boolean;
  isDark: boolean;
  chartType: ChartType;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
  onPanStart: () => void;
  onPanDelta: (delta: number) => void;
  overlays: ChartOverlays;
  showMa: boolean;
  showVolume: boolean;
}

export interface InfoBarProps {
  hov: Candle | null;
  prevClose: number | null;
  ma7Val: number | null;
  ma25Val: number | null;
  currency: string | null;
  isDark: boolean;
  subtleText: string;
  showPrevDelta: boolean;
}

export interface StockChartProps {
  companyId?: string;
  symbol?: string;
  companyName?: string;
  financials?: import("@/lib/api/company-analysis").YearlyFinancial[];
  disclosures?: { title: string; date: string; url: string }[];
  isDark: boolean;
  panelClass: string;
  mutedPanel: string;
  subtleText: string;
}
