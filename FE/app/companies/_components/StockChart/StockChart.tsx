"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompanyFinancialInsights,
  CompanyStockQuote,
} from "@/lib/api/companies";
import {
  getCompanyStock,
  getCompanyStockBySymbol,
  getCompanyFinancialInsights,
  getCompanyQuarterlyFinancials,
} from "@/lib/api/companies";
import { getStockQuote } from "@/lib/api/stock";
import type {
  IntervalKey,
  ChartType,
  Candle,
  AnnotationType,
  ChartAnnotation,
  StockChartProps,
  IndicatorId,
  ChartOverlays,
  SubPanelData,
} from "./types";
import {
  INTERVALS,
  CHART_TYPES,
  WINDOW_SIZE,
  WINDOW_SIZE_MIN,
  WINDOW_SIZE_MAX,
  LOAD_MORE_INTERVALS,
} from "./constants";
import {
  calcMA,
  changePct,
  fmtMarketCap,
  fmtPrice,
  fmtSigned,
  fmtPct,
  typeLabel,
} from "./utils";
import { PriceVolumeChart } from "./PriceVolumeChart";
import { OhlcvInfoBar } from "./OhlcvInfoBar";
import { StockChartSkeleton } from "./StockChartSkeleton";
import { IndicatorPanel } from "./IndicatorPanel";
import { SubIndicatorChart } from "./SubIndicatorChart";
import { TradingStrategyPanel } from "./TradingStrategyPanel";
import {
  calcBollingerBands,
  calcEnvelope,
  calcPriceChannel,
  calcVWAP,
  calcParabolicSAR,
  calcIchimoku,
  calcRSI,
  calcMACD,
  calcStochasticFast,
  calcStochasticSlow,
  calcCCI,
  calcMomentum,
  calcROC,
  calcATR,
  calcOBV,
  calcMFI,
  calcCMF,
  calcWilliamsR,
  calcADX,
  calcAroon,
  calcAroonOscillator,
  calcStochasticRSI,
  calcTRIX,
  calcElderRay,
  calcChaikinOscillator,
  calcChaikinVolatility,
  calcADLine,
  calcMassIndex,
  calcUltimateOscillator,
  calcForceIndex,
  calcPVO,
  calcPPO,
  calcPVI,
  calcNVI,
  calcEOM,
  calcPsychologicalLine,
  calcVolumeRatio,
  calcDisparity,
  calcSONAR,
  calcTradingValue,
} from "./indicator-calc";

export function StockChart({
  companyId,
  symbol,
  companyName = "",
  financials = [],
  disclosures = [],
  isDark,
  panelClass,
  mutedPanel: _mutedPanel,
  subtleText,
}: StockChartProps) {
  const [interval, setIntervalKey] = useState<IntervalKey>("1d");
  const [chartType, setChartType] = useState<ChartType>("candlestick");
  const [stock, setStock] = useState<CompanyStockQuote | null>(null);
  const [insights, setInsights] = useState<CompanyFinancialInsights | null>(
    null,
  );
  const [quarterEvents, setQuarterEvents] = useState<ChartAnnotation[]>([]);
  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [panOffset, setPanOffset] = useState(0);
  const [zoomWindow, setZoomWindow] = useState(WINDOW_SIZE);
  const [enabledAnnotations, setEnabledAnnotations] = useState<
    Record<AnnotationType, boolean>
  >({
    news: true,
    disclosure: true,
    financial: true,
    risk: true,
  });
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorId>>(
    () => new Set<IndicatorId>(["ma", "volume"]),
  );
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);
  const toggleIndicator = useCallback((id: IndicatorId) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setIndicatorPreset = useCallback((ids: IndicatorId[]) => {
    setActiveIndicators(new Set<IndicatorId>(ids));
  }, []);
  const panBaseRef = useRef(0);
  const loadMoreRef = useRef(false);
  const zoomWindowRef = useRef(WINDOW_SIZE);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteKey = companyId ?? symbol ?? "";
  const loadQuote = useCallback(
    (nextInterval: string, before?: string) => {
      if (companyId) return getCompanyStock(companyId, nextInterval, before);
      if (symbol) return getCompanyStockBySymbol(symbol, nextInterval, before);
      return getStockQuote("", companyName, nextInterval, before);
    },
    [companyId, companyName, symbol],
  );

  // 차트 컨테이너 실제 픽셀 너비/높이 — viewBox와 1:1 매칭으로 화질 개선
  const [containerSize, setContainerSize] = useState({ w: 600, h: 432 });
  const prevSizeRef = useRef({ w: 600, h: 432 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const chartWrapRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (el) {
      const updateSize = (w: number, h: number) => {
        if (w > 0 && h > 0) {
          const prev = prevSizeRef.current;
          if (prev.w === w && prev.h === h) return;

          // 가로 너비가 변하면, 시각적 밀도(캔들 두께)를 유지하기 위해 zoomWindow를 비례해서 늘리거나 줄임
          if (prev.w > 0 && w !== prev.w) {
            setZoomWindow((currZoom) => {
              const ratio = w / prev.w;
              return Math.max(20, Math.round(currZoom * ratio));
            });
          }

          prevSizeRef.current = { w, h };
          setContainerSize({ w, h });
        }
      };

      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        const h = entries[0]?.contentRect.height;
        updateSize(w, h);
      });
      ro.observe(el);
      observerRef.current = ro;

      const rect = el.getBoundingClientRect();
      updateSize(rect.width, rect.height);
    }
  }, []);

  /* 초기 데이터 로드 */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHoveredIdx(null);
    setPanOffset(0);
    const currentW = prevSizeRef.current.w;
    const initialZoom =
      currentW > 0
        ? Math.max(WINDOW_SIZE_MIN, Math.round(WINDOW_SIZE * (currentW / 600)))
        : WINDOW_SIZE;
    setZoomWindow(initialZoom);
    setHasMore(LOAD_MORE_INTERVALS.has(interval));
    loadMoreRef.current = false;
    loadQuote(interval)
      .then((s) => {
        if (!cancelled) {
          setStock(s);
          const validChart = s.chart.filter(
            (c) => c.close != null && c.close > 0,
          );
          setAllCandles(validChart);
          setError(s.error ?? "");
          if (validChart.length === 0) setHasMore(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "오류");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [interval, loadQuote, quoteKey]);

  useEffect(() => {
    if (!companyId) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    getCompanyFinancialInsights(companyId)
      .then((next) => {
        if (!cancelled) setInsights(next);
      })
      .catch(() => {
        if (!cancelled) setInsights(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setQuarterEvents([]);
      return;
    }
    let cancelled = false;
    getCompanyQuarterlyFinancials(companyId)
      .then((items) => {
        if (cancelled) return;
        const sorted = [...items].sort(
          (a, b) => a.year - b.year || a.quarter - b.quarter,
        );
        const itemMap = new Map(
          sorted.map((item) => [`${item.year}-${item.quarter}`, item]),
        );
        setQuarterEvents(
          sorted.map((item) => {
            const previousQuarter =
              item.quarter === 1
                ? itemMap.get(`${item.year - 1}-4`)
                : itemMap.get(`${item.year}-${item.quarter - 1}`);
            const previousYear = itemMap.get(
              `${item.year - 1}-${item.quarter}`,
            );
            const metric = (
              key: "revenue" | "operatingProfit" | "netIncome",
              label: string,
            ) => ({
              key,
              label,
              value: item[key],
              comparisons: [
                {
                  label: "전분기",
                  value: changePct(item[key], previousQuarter?.[key]),
                },
                {
                  label: "전년동기",
                  value: changePct(item[key], previousYear?.[key]),
                },
              ],
            });
            return {
              type: "financial" as const,
              date: `${item.year}-${String(item.quarter * 3).padStart(2, "0")}-${item.quarter === 4 ? "31" : "30"}`,
              title: `${item.year}년 ${item.quarter}분기 실적`,
              description: "매출·영업이익·순이익 및 전분기/전년동기 증감률",
              url: item.rceptNo
                ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(item.rceptNo)}`
                : "#company-financials",
              severity:
                item.operatingProfit != null && item.operatingProfit < 0
                  ? ("warning" as const)
                  : ("positive" as const),
              financialDetails: {
                periodLabel: `${item.year}년 ${item.quarter}분기`,
                metrics: [
                  metric("revenue", "매출"),
                  metric("operatingProfit", "영업이익"),
                  metric("netIncome", "순이익"),
                ],
              },
            };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setQuarterEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  /* zoomWindowRef를 zoomWindow 최신값과 동기화 */
  zoomWindowRef.current = zoomWindow;

  /* 이전 데이터 추가 로드 */
  const loadMore = useCallback(
    async (candles: Candle[]) => {
      if (loadMoreRef.current || !hasMore || candles.length === 0) return;
      const oldest = candles[0];
      if (!oldest) return;
      loadMoreRef.current = true;
      setLoadingMore(true);
      try {
        const res = await loadQuote(interval, oldest.date);
        const existingDates = new Set(candles.map((c) => c.date));
        const newCandles = res.chart.filter(
          (c) => !existingDates.has(c.date) && c.close != null && c.close > 0,
        );
        if (newCandles.length === 0) {
          setHasMore(false);
        } else {
          setAllCandles((prev) => {
            const merged = [
              ...newCandles.filter((c) => !prev.some((p) => p.date === c.date)),
              ...prev,
            ];
            // 왼쪽에 N개 추가: off + N - W → startIdx = W (재트리거 방지 버퍼)
            // Math.max(0,...) 는 음수 방지, N < W일 때 오른쪽으로 당겨지는 양 자동 조정
            setPanOffset((off) =>
              Math.max(0, off + newCandles.length - zoomWindowRef.current),
            );
            return merged;
          });
        }
      } catch {
        // 실패 시 무시
      } finally {
        setLoadingMore(false);
        loadMoreRef.current = false;
      }
    },
    [hasMore, interval, loadQuote],
  );

  const chart = allCandles;
  const ma7Full = calcMA(chart, 7);
  const ma25Full = calcMA(chart, 25);
  const currency = stock?.currency ?? null;

  // 일봉/주봉은 마지막 두 캔들 기준으로 헤더 등락 계산
  const CANDLE_INTERVALS = new Set<IntervalKey>(["1d", "1w"]);
  const lastCandle = chart.at(-1) ?? null;
  const prevCandle = chart.length >= 2 ? (chart.at(-2) ?? null) : null;
  const displayChange: number | null =
    CANDLE_INTERVALS.has(interval) && lastCandle && prevCandle
      ? lastCandle.close - prevCandle.close
      : (stock?.change ?? null);
  const displayChangePercent: number | null =
    CANDLE_INTERVALS.has(interval) &&
    lastCandle &&
    prevCandle &&
    prevCandle.close
      ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100
      : (stock?.changePercent ?? null);
  const isUp = (displayChange ?? 0) >= 0;

  /* 윈도우 슬라이싱 */
  const windowSize = Math.min(chart.length, zoomWindow);
  const maxPanOffset = Math.max(0, chart.length - windowSize);
  const clampedOffset = Math.max(0, Math.min(maxPanOffset, panOffset));
  const startIdx = chart.length - windowSize - clampedOffset;
  const endIdx =
    clampedOffset === 0 ? chart.length : chart.length - clampedOffset;
  const visibleChart = chart.slice(startIdx, endIdx);
  const visibleMa7 = ma7Full.slice(startIdx, endIdx);
  const visibleMa25 = ma25Full.slice(startIdx, endIdx);

  /* ── 보조지표 계산 ── */
  const closes = useMemo(
    () => visibleChart.map((d) => d.close),
    [visibleChart],
  );

  const overlays = useMemo<ChartOverlays>(() => {
    const result: ChartOverlays = {};
    if (activeIndicators.has("bb")) {
      const { upper, middle, lower } = calcBollingerBands(closes);
      result.bb = {
        upper,
        middle,
        lower,
        color: isDark ? "#60a5fa" : "#2563eb",
      };
    }
    if (activeIndicators.has("envelope")) {
      const { upper, middle, lower } = calcEnvelope(closes);
      result.envelope = {
        upper,
        middle,
        lower,
        color: isDark ? "#34d399" : "#059669",
      };
    }
    if (activeIndicators.has("priceChannel")) {
      const { upper, lower } = calcPriceChannel(visibleChart);
      result.priceChannel = {
        upper,
        lower,
        color: isDark ? "#fbbf24" : "#d97706",
      };
    }
    if (activeIndicators.has("vwap")) result.vwap = calcVWAP(visibleChart);
    if (activeIndicators.has("sar"))
      result.sar = calcParabolicSAR(visibleChart);
    if (activeIndicators.has("ichimoku"))
      result.ichimoku = calcIchimoku(visibleChart);
    return result;
  }, [activeIndicators, closes, visibleChart, isDark]);

  const subPanels = useMemo<SubPanelData[]>(() => {
    const panels: SubPanelData[] = [];
    const has = (id: IndicatorId) => activeIndicators.has(id);
    const c1 = isDark ? "#60a5fa" : "#2563eb";
    const c2 = isDark ? "#fbbf24" : "#d97706";
    const c3 = isDark ? "#34d399" : "#059669";
    const hpos = isDark ? "rgba(52,211,153,0.65)" : "rgba(5,150,105,0.65)";
    const hneg = isDark ? "rgba(244,63,94,0.65)" : "rgba(225,29,72,0.65)";
    const z0 = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
    const lv70 = {
      value: 70,
      color: isDark ? "#f43f5e" : "#e11d48",
      dash: "3,3",
    };
    const lv30 = {
      value: 30,
      color: isDark ? "#38bdf8" : "#0284c7",
      dash: "3,3",
    };
    const lv80 = {
      value: 80,
      color: isDark ? "#f43f5e" : "#e11d48",
      dash: "3,3",
    };
    const lv20 = {
      value: 20,
      color: isDark ? "#38bdf8" : "#0284c7",
      dash: "3,3",
    };
    const lv0 = { value: 0, color: z0 };

    const add = (id: IndicatorId, panel: SubPanelData) => {
      if (has(id)) panels.push(panel);
    };

    add("tradingValue", {
      id: "tradingValue",
      label: "거래대금",
      lines: [{ values: calcTradingValue(visibleChart), color: c1, label: "" }],
    });

    if (has("macd")) {
      const { macd, signal, histogram } = calcMACD(closes);
      panels.push({
        id: "macd",
        label: "MACD(12,26,9)",
        lines: [
          { values: macd, color: c1, label: "MACD" },
          { values: signal, color: c2, label: "Sig" },
        ],
        histBars: { values: histogram, posColor: hpos, negColor: hneg },
        levels: [lv0],
      });
    }

    if (has("stochFast")) {
      const { k, d } = calcStochasticFast(visibleChart);
      panels.push({
        id: "stochFast",
        label: "Stoch Fast(14,3)",
        lines: [
          { values: k, color: c1, label: "%K" },
          { values: d, color: c2, label: "%D" },
        ],
        levels: [lv80, lv20],
        valueRange: [0, 100],
      });
    }

    if (has("stochSlow")) {
      const { k, d } = calcStochasticSlow(visibleChart);
      panels.push({
        id: "stochSlow",
        label: "Stoch Slow(14,3,3)",
        lines: [
          { values: k, color: c1, label: "%K" },
          { values: d, color: c2, label: "%D" },
        ],
        levels: [lv80, lv20],
        valueRange: [0, 100],
      });
    }

    add("rsi", {
      id: "rsi",
      label: "RSI(14)",
      lines: [{ values: calcRSI(closes), color: c1, label: "" }],
      levels: [lv70, lv30],
      valueRange: [0, 100],
    });

    add("cci", {
      id: "cci",
      label: "CCI(20)",
      lines: [{ values: calcCCI(visibleChart), color: c3, label: "" }],
      levels: [
        { value: 100, color: isDark ? "#f43f5e" : "#e11d48", dash: "3,3" },
        { value: -100, color: isDark ? "#38bdf8" : "#0284c7", dash: "3,3" },
      ],
    });

    add("momentum", {
      id: "momentum",
      label: "Momentum(10)",
      lines: [
        {
          values: calcMomentum(closes),
          color: isDark ? "#a78bfa" : "#7c3aed",
          label: "",
        },
      ],
      levels: [lv0],
    });

    add("disparity", {
      id: "disparity",
      label: "이격도(MA20)",
      lines: [{ values: calcDisparity(closes), color: c1, label: "" }],
      levels: [lv0],
    });

    add("volumeRatio", {
      id: "volumeRatio",
      label: "Volume Ratio(20)",
      lines: [{ values: calcVolumeRatio(visibleChart), color: c2, label: "" }],
      levels: [
        { value: 100, color: isDark ? "#f43f5e" : "#e11d48", dash: "3,3" },
      ],
    });

    add("roc", {
      id: "roc",
      label: "ROC(12)",
      lines: [{ values: calcROC(closes), color: c1, label: "" }],
      levels: [lv0],
    });

    add("adLine", {
      id: "adLine",
      label: "AD Line",
      lines: [{ values: calcADLine(visibleChart), color: c3, label: "" }],
    });

    add("atr", {
      id: "atr",
      label: "ATR(14)",
      lines: [{ values: calcATR(visibleChart), color: c2, label: "" }],
    });

    add("cmf", {
      id: "cmf",
      label: "CMF(20)",
      lines: [{ values: calcCMF(visibleChart), color: c1, label: "" }],
      levels: [lv0],
    });

    add("mfi", {
      id: "mfi",
      label: "MFI(14)",
      lines: [{ values: calcMFI(visibleChart), color: c1, label: "" }],
      levels: [lv80, lv20],
      valueRange: [0, 100],
    });

    add("obv", {
      id: "obv",
      label: "OBV",
      lines: [{ values: calcOBV(visibleChart), color: c3, label: "" }],
    });

    add("psychLine", {
      id: "psychLine",
      label: "투자심리도(12)",
      lines: [
        { values: calcPsychologicalLine(visibleChart), color: c1, label: "" },
      ],
      levels: [
        { value: 75, color: isDark ? "#f43f5e" : "#e11d48", dash: "3,3" },
        { value: 25, color: isDark ? "#38bdf8" : "#0284c7", dash: "3,3" },
      ],
      valueRange: [0, 100],
    });

    add("sonar", {
      id: "sonar",
      label: "SONAR",
      lines: [{ values: calcSONAR(closes), color: c1, label: "" }],
      levels: [lv0],
    });

    add("chaikinVol", {
      id: "chaikinVol",
      label: "Chaikin Volatility",
      lines: [
        { values: calcChaikinVolatility(visibleChart), color: c2, label: "" },
      ],
    });

    add("chaikinOsc", {
      id: "chaikinOsc",
      label: "Chaikin Oscillator",
      lines: [
        { values: calcChaikinOscillator(visibleChart), color: c3, label: "" },
      ],
      levels: [lv0],
    });

    add("trix", {
      id: "trix",
      label: "TRIX(15)",
      lines: [{ values: calcTRIX(closes), color: c1, label: "" }],
      levels: [lv0],
    });

    add("williamsR", {
      id: "williamsR",
      label: "Williams %R(14)",
      lines: [{ values: calcWilliamsR(visibleChart), color: c1, label: "" }],
      levels: [
        { value: -20, color: isDark ? "#f43f5e" : "#e11d48", dash: "3,3" },
        { value: -80, color: isDark ? "#38bdf8" : "#0284c7", dash: "3,3" },
      ],
      valueRange: [-100, 0],
    });

    if (has("adx")) {
      const { plusDI, minusDI, adx } = calcADX(visibleChart);
      panels.push({
        id: "adx",
        label: "ADX/DMI(14)",
        lines: [
          { values: adx, color: c2, label: "ADX" },
          {
            values: plusDI,
            color: isDark ? "#f43f5e" : "#e11d48",
            label: "+DI",
          },
          {
            values: minusDI,
            color: isDark ? "#38bdf8" : "#0284c7",
            label: "-DI",
          },
        ],
        levels: [{ value: 25, color: z0, dash: "3,3" }],
      });
    }

    if (has("aroon")) {
      const { up, down } = calcAroon(visibleChart);
      panels.push({
        id: "aroon",
        label: "Aroon(25)",
        lines: [
          { values: up, color: isDark ? "#f43f5e" : "#e11d48", label: "Up" },
          { values: down, color: isDark ? "#38bdf8" : "#0284c7", label: "Dn" },
        ],
        valueRange: [0, 100],
      });
    }

    add("aroonOsc", {
      id: "aroonOsc",
      label: "Aroon Osc(25)",
      lines: [
        { values: calcAroonOscillator(visibleChart), color: c1, label: "" },
      ],
      levels: [lv0],
      valueRange: [-100, 100],
    });

    if (has("elderBull") || has("elderBear")) {
      const { bull, bear } = calcElderRay(visibleChart);
      if (has("elderBull"))
        panels.push({
          id: "elderBull",
          label: "Elder Ray Bull",
          lines: [{ values: bull, color: c3, label: "" }],
          levels: [lv0],
        });
      if (has("elderBear"))
        panels.push({
          id: "elderBear",
          label: "Elder Ray Bear",
          lines: [
            { values: bear, color: isDark ? "#f43f5e" : "#e11d48", label: "" },
          ],
          levels: [lv0],
        });
    }

    if (has("stochRsi")) {
      const { k, d } = calcStochasticRSI(closes);
      panels.push({
        id: "stochRsi",
        label: "Stoch RSI",
        lines: [
          { values: k, color: c1, label: "%K" },
          { values: d, color: c2, label: "%D" },
        ],
        levels: [lv80, lv20],
        valueRange: [0, 100],
      });
    }

    add("massIndex", {
      id: "massIndex",
      label: "Mass Index(25)",
      lines: [{ values: calcMassIndex(visibleChart), color: c2, label: "" }],
      levels: [
        { value: 27, color: isDark ? "#f43f5e" : "#e11d48", dash: "3,3" },
        { value: 26.5, color: isDark ? "#38bdf8" : "#0284c7", dash: "3,3" },
      ],
    });

    add("pvi", {
      id: "pvi",
      label: "PVI",
      lines: [{ values: calcPVI(visibleChart), color: c3, label: "" }],
    });

    add("nvi", {
      id: "nvi",
      label: "NVI",
      lines: [{ values: calcNVI(visibleChart), color: c2, label: "" }],
    });

    add("eom", {
      id: "eom",
      label: "EOM(14)",
      lines: [{ values: calcEOM(visibleChart), color: c1, label: "" }],
      levels: [lv0],
    });

    add("ultimateOsc", {
      id: "ultimateOsc",
      label: "Ultimate Osc(7,14,28)",
      lines: [
        { values: calcUltimateOscillator(visibleChart), color: c1, label: "" },
      ],
      levels: [lv70, lv30],
      valueRange: [0, 100],
    });

    if (has("pvo")) {
      const { pvo, signal, histogram } = calcPVO(visibleChart);
      panels.push({
        id: "pvo",
        label: "PVO(12,26,9)",
        lines: [
          { values: pvo, color: c1, label: "PVO" },
          { values: signal, color: c2, label: "Sig" },
        ],
        histBars: { values: histogram, posColor: hpos, negColor: hneg },
        levels: [lv0],
      });
    }

    if (has("ppo")) {
      const { ppo, signal, histogram } = calcPPO(closes);
      panels.push({
        id: "ppo",
        label: "PPO(12,26,9)",
        lines: [
          { values: ppo, color: c1, label: "PPO" },
          { values: signal, color: c2, label: "Sig" },
        ],
        histBars: { values: histogram, posColor: hpos, negColor: hneg },
        levels: [lv0],
      });
    }

    add("forceIndex", {
      id: "forceIndex",
      label: "Force Index(13)",
      lines: [{ values: calcForceIndex(visibleChart), color: c1, label: "" }],
      levels: [lv0],
    });

    return panels;
  }, [activeIndicators, closes, visibleChart, isDark]);

  const SUB_PANEL_H = 88;
  const priceChartH = Math.max(
    200,
    containerSize.h - subPanels.length * SUB_PANEL_H,
  );

  const chartAnnotations = useMemo<ChartAnnotation[]>(() => {
    const disclosureEvents: ChartAnnotation[] = disclosures.map((item) => ({
      type: "disclosure",
      date: item.date,
      title: item.title,
      url: item.url,
      severity: "info",
    }));
    const sortedFinancials = [...financials].sort((a, b) => a.year - b.year);
    const financialEvents: ChartAnnotation[] = sortedFinancials
      .slice(-5)
      .map((item) => {
        const previous = sortedFinancials.find(
          (candidate) => candidate.year === item.year - 1,
        );
        const metric = (
          key: "revenue" | "operatingProfit" | "netIncome",
          label: string,
        ) => ({
          key,
          label,
          value: item[key],
          comparisons: [
            { label: "전년", value: changePct(item[key], previous?.[key]) },
          ],
        });
        return {
          type: "financial",
          date: `${item.year}-12-31`,
          title: `${item.year}년 실적`,
          description: "매출·영업이익·순이익 및 전년 대비 증감률",
          url: "#company-financials",
          severity:
            item.operatingProfit != null && item.operatingProfit < 0
              ? "warning"
              : "positive",
          financialDetails: {
            periodLabel: `${item.year}년 연간`,
            metrics: [
              metric("revenue", "매출"),
              metric("operatingProfit", "영업이익"),
              metric("netIncome", "순이익"),
            ],
          },
        };
      });
    const combined = [
      ...financialEvents,
      ...disclosureEvents,
      ...(insights?.timelineEvents ?? []),
      ...quarterEvents,
    ];
    const seen = new Set<string>();
    return combined
      .filter((item) => enabledAnnotations[item.type])
      .filter((item) => {
        const key = `${item.type}:${item.date}:${item.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [
    disclosures,
    enabledAnnotations,
    financials,
    insights?.timelineEvents,
    quarterEvents,
  ]);

  /* 왼쪽 끝에서 절반 윈도우 이내 도달 시 더 가져오기 (200ms 디바운스) */
  useEffect(() => {
    if (
      !hasMore ||
      loadMoreRef.current ||
      loadingMore ||
      loading ||
      chart.length === 0
    )
      return;
    if (startIdx < Math.floor(zoomWindow / 2)) {
      if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = setTimeout(() => {
        loadMoreTimerRef.current = null;
        loadMore(chart);
      }, 200);
    } else {
      if (loadMoreTimerRef.current) {
        clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
    }
    return () => {
      if (loadMoreTimerRef.current) {
        clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
    };
  }, [startIdx, zoomWindow, hasMore, loadingMore, loading, chart, loadMore]);

  /* 팬 콜백 */
  const handlePanStart = useCallback(() => {
    panBaseRef.current = clampedOffset;
  }, [clampedOffset]);
  const handlePanDelta = useCallback(
    (delta: number) => {
      setPanOffset(
        Math.max(0, Math.min(maxPanOffset, panBaseRef.current + delta)),
      );
    },
    [maxPanOffset],
  );
  const handleChartWheel = useCallback(
    (event: React.WheelEvent) => {
      const horizontal = Math.abs(event.deltaX);
      const vertical = Math.abs(event.deltaY);

      // 세로 스와이프 → 아래: 줌인, 위: 줌아웃
      if (vertical >= horizontal && vertical > 0) {
        event.preventDefault();
        const step = Math.max(2, Math.min(12, Math.ceil(vertical * 0.12)));
        setZoomWindow((prev) =>
          Math.max(
            WINDOW_SIZE_MIN,
            Math.min(WINDOW_SIZE_MAX, prev + (event.deltaY > 0 ? -step : step)),
          ),
        );
        return;
      }

      // 수평 스크롤 → 이동 (오른쪽 = 과거)
      if (horizontal > vertical) {
        event.preventDefault();
        // deltaX > 0 = 손가락 왼쪽 이동 → 오른쪽 스크롤 → 과거 (panOffset 감소)
        // deltaX < 0 = 손가락 오른쪽 이동 → 왼쪽 스크롤 → 미래 (panOffset 증가)
        const direction = event.deltaX > 0 ? -1 : 1;
        setPanOffset((prev) =>
          Math.max(0, Math.min(maxPanOffset, prev + direction * 6)),
        );
      }
    },
    [maxPanOffset],
  );

  if (loading && !stock) {
    return (
      <StockChartSkeleton
        isDark={isDark}
        panelClass={panelClass}
        subtleText={subtleText}
      />
    );
  }

  const priceClr = isUp ? "text-rose-500" : "text-sky-500";
  const latestCandle = chart.at(-1) ?? null;
  const trailing21 = chart.slice(-21);
  const monthHigh = trailing21.length
    ? Math.max(...trailing21.map((d) => d.high ?? d.close))
    : null;
  const monthLow = trailing21.length
    ? Math.min(...trailing21.map((d) => d.low ?? d.close))
    : null;
  const returnFromIndex = (idx: number) => {
    if (!latestCandle || idx < 0 || !chart[idx]) return null;
    const base = chart[idx].close;
    if (!base) return null;
    return ((latestCandle.close - base) / base) * 100;
  };
  const ytdIndex = chart.findIndex(
    (d) => d.date >= `${new Date().getFullYear()}-01-01`,
  );
  const returnItems = [
    { label: "1W", value: returnFromIndex(chart.length - 1 - 5) },
    { label: "1M", value: returnFromIndex(chart.length - 1 - 21) },
    { label: "3M", value: returnFromIndex(chart.length - 1 - 63) },
    { label: "6M", value: returnFromIndex(chart.length - 1 - 126) },
    { label: "1Y", value: returnFromIndex(chart.length - 1 - 252) },
    { label: "YTD", value: ytdIndex >= 0 ? returnFromIndex(ytdIndex) : null },
  ];
  const stockSourceLabel = stock?.source.includes("Naver")
    ? "Yahoo Finance(과거 차트) · 네이버 금융(실시간)"
    : stock?.source || null;

  const hov = hoveredIdx !== null ? (visibleChart[hoveredIdx] ?? null) : null;
  const ma7Val = hoveredIdx !== null ? (visibleMa7[hoveredIdx] ?? null) : null;
  const ma25Val =
    hoveredIdx !== null ? (visibleMa25[hoveredIdx] ?? null) : null;

  // 1d 모드에서 이전 캔들 대비 % 계산용 — 윈도우 경계 밖도 고려
  const prevClose: number | null = (() => {
    if (hoveredIdx === null) return null;
    if (hoveredIdx > 0) return visibleChart[hoveredIdx - 1]?.close ?? null;
    if (startIdx > 0) return chart[startIdx - 1]?.close ?? null;
    return null;
  })();

  const tabBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-bold transition-all duration-200 ${
      active
        ? isDark
          ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
          : "bg-indigo-50 text-indigo-600 border border-indigo-200"
        : isDark
          ? "border border-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
          : "border border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-700"
    }`;

  return (
    <section
      className={`h-full flex flex-col overscroll-contain rounded-md border overflow-hidden relative ${panelClass}`}
      style={{ overscrollBehaviorX: "contain" }}
    >
      <IndicatorPanel
        open={showIndicatorPanel}
        onClose={() => setShowIndicatorPanel(false)}
        active={activeIndicators}
        onToggle={toggleIndicator}
        isDark={isDark}
      />
      <TradingStrategyPanel
        open={showStrategyPanel}
        onClose={() => setShowStrategyPanel(false)}
        activeIndicators={activeIndicators}
        onSetIndicators={setIndicatorPreset}
        chart={visibleChart}
        ma7={visibleMa7}
        ma25={visibleMa25}
        overlays={overlays}
        subPanels={subPanels}
        symbol={stock?.symbol ?? stock?.stockCode ?? ""}
        companyName={stock?.companyName || companyName || undefined}
        interval={interval}
        currentPrice={stock?.regularMarketPrice ?? 0}
        changePercent={displayChangePercent ?? 0}
        isDark={isDark}
      />

      {/* ── 헤더 ── */}
      <div
        className={`shrink-0 border-b px-4 py-3 ${isDark ? "border-white/10" : "border-slate-200"}`}
      >
        {!stock || stock.regularMarketPrice == null ? (
          <div>
            <p className="text-sm font-bold">
              주식 데이터를 표시할 수 없습니다.
            </p>
            <p className={`mt-1 text-xs ${subtleText}`}>
              {error || "종목코드가 없거나 시세 제공 대상이 아닙니다."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-200 text-indigo-600"}`}
                  >
                    {stock.symbol ?? stock.stockCode}
                  </span>
                  <span className={`text-xs font-semibold ${subtleText}`}>
                    {[stock.exchangeName, currency].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-mono text-2xl font-black tracking-tight ${priceClr}`}
                  >
                    {isUp ? "▲ " : "▼ "}
                    {fmtPrice(stock.regularMarketPrice, currency)}
                  </span>
                  <span className={`font-mono text-sm font-bold ${priceClr}`}>
                    {fmtSigned(displayChange, currency === "KRW" ? 0 : 2)} (
                    {fmtSigned(displayChangePercent)}%)
                  </span>
                </div>
              </div>
              {stock.marketCap != null ? (
                <div className="ml-auto text-left sm:text-right">
                  <p className={`text-[10px] font-bold ${subtleText}`}>
                    시가총액
                  </p>
                  <p
                    className={`mt-0.5 font-mono text-base font-black ${isDark ? "text-white/90" : "text-slate-800"}`}
                  >
                    {fmtMarketCap(stock.marketCap, currency)}
                  </p>
                </div>
              ) : null}
            </div>
            <div
              className={`mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2.5 border-t ${isDark ? "border-white/5" : "border-slate-100"} font-mono text-xs ${subtleText}`}
            >
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                  전일종가
                </span>
                <span
                  className={`text-sm font-bold mt-0.5 ${isDark ? "text-white/80" : "text-slate-700"}`}
                >
                  {fmtPrice(stock.previousClose, currency)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500/80">
                  최고가 (1개월)
                </span>
                <span className="text-sm font-bold mt-0.5 text-rose-500">
                  {fmtPrice(monthHigh, currency)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-sky-500/80">
                  최저가 (1개월)
                </span>
                <span className="text-sm font-bold mt-0.5 text-sky-500">
                  {fmtPrice(monthLow, currency)}
                </span>
              </div>
              {stock.fetchedAt && (
                <div className="flex flex-col items-start sm:items-end">
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                    업데이트 기준
                  </span>
                  <span className="text-sm font-medium mt-0.5">
                    {new Date(stock.fetchedAt).toLocaleString("ko-KR", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {returnItems.map((item) => (
                  <span
                    key={item.label}
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] font-bold ${
                      item.value == null
                        ? isDark
                          ? "border-white/10 text-white/25"
                          : "border-slate-100 text-slate-300"
                        : item.value >= 0
                          ? isDark
                            ? "border-rose-400/20 bg-rose-400/10 text-rose-300"
                            : "border-rose-100 bg-rose-50 text-rose-600"
                          : isDark
                            ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                            : "border-sky-100 bg-sky-50 text-sky-600"
                    }`}
                  >
                    {item.label} {fmtPct(item.value)}
                  </span>
                ))}
              </div>
              {stockSourceLabel ? (
                <span
                  className={`ml-auto text-right text-[10px] font-medium ${subtleText}`}
                  title={stock.source}
                >
                  출처 · {stockSourceLabel}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* ── 툴바 ── */}
      <div
        className={`flex flex-wrap items-center gap-2 border-b px-3 py-1 ${isDark ? "border-white/10" : "border-slate-100"}`}
      >
        <div className="flex gap-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv.key}
              onClick={() => setIntervalKey(iv.key)}
              className={tabBtn(interval === iv.key)}
            >
              {iv.label}
            </button>
          ))}
        </div>
        <span
          className={`h-4 w-px ${isDark ? "bg-white/10" : "bg-slate-200"}`}
        />
        <div className="flex gap-0.5">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.key}
              onClick={() => setChartType(ct.key)}
              className={tabBtn(chartType === ct.key)}
            >
              {ct.label}
            </button>
          ))}
        </div>
        <span
          className={`h-4 w-px ${isDark ? "bg-white/10" : "bg-slate-200"}`}
        />
        <div className="flex flex-wrap gap-0.5">
          {(
            ["news", "disclosure", "financial", "risk"] as AnnotationType[]
          ).map((type) => {
            const active = enabledAnnotations[type];
            return (
              <button
                key={type}
                onClick={() =>
                  setEnabledAnnotations((prev) => ({
                    ...prev,
                    [type]: !prev[type],
                  }))
                }
                className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                  active
                    ? isDark
                      ? "border-white/15 bg-white/10 text-white/80"
                      : "border-slate-200 bg-slate-100 text-slate-700"
                    : isDark
                      ? "border-transparent text-white/30 hover:bg-white/5"
                      : "border-transparent text-slate-300 hover:bg-slate-50"
                }`}
              >
                {typeLabel(type)}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {activeIndicators.has("ma") && (
            <div
              className={`flex items-center gap-3 font-mono text-xs ${subtleText}`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: isDark ? "#f59e0b" : "#d97706" }}
                />
                <span
                  className={
                    isDark ? "text-amber-400" : "text-amber-600 font-semibold"
                  }
                >
                  MA7
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: isDark ? "#a78bfa" : "#7c3aed" }}
                />
                <span
                  className={
                    isDark ? "text-violet-400" : "text-violet-700 font-semibold"
                  }
                >
                  MA25
                </span>
              </span>
            </div>
          )}
          <span
            className={`mx-0.5 h-4 w-px ${isDark ? "bg-white/10" : "bg-slate-200"}`}
          />
          <button
            type="button"
            onClick={() => {
              setShowStrategyPanel((v) => !v);
              setShowIndicatorPanel(false);
            }}
            className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
              showStrategyPanel
                ? isDark
                  ? "border-emerald-500/50 text-emerald-300"
                  : "border-emerald-500 text-emerald-700"
                : isDark
                  ? "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            매매 전략
          </button>
          <button
            type="button"
            onClick={() => {
              setShowIndicatorPanel((v) => !v);
              setShowStrategyPanel(false);
            }}
            className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
              showIndicatorPanel
                ? isDark
                  ? "border-indigo-500/50 text-indigo-300"
                  : "border-indigo-500 text-indigo-600"
                : isDark
                  ? "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            보조지표
          </button>
        </div>
      </div>

      {/* ── OHLCV 인포바 ── */}
      <div className="shrink-0">
        <OhlcvInfoBar
          hov={hov}
          prevClose={prevClose}
          ma7Val={ma7Val}
          ma25Val={ma25Val}
          currency={currency}
          isDark={isDark}
          subtleText={subtleText}
          showPrevDelta={interval === "1d"}
        />
      </div>

      {/* ── 차트 ── */}
      <div
        ref={chartWrapRef}
        className="flex-1 min-h-0 relative flex flex-col px-2 pb-1"
        onWheel={handleChartWheel}
      >
        {loading && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center text-sm ${isDark ? "bg-slate-900/40 backdrop-blur-xs" : "bg-white/40 backdrop-blur-xs"} ${subtleText}`}
          >
            <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mr-2" />
            불러오는 중...
          </div>
        )}
        {visibleChart.length >= 2 ? (
          <>
            <PriceVolumeChart
              containerSize={{ w: containerSize.w, h: priceChartH }}
              chart={visibleChart}
              ma7={visibleMa7}
              ma25={visibleMa25}
              annotations={chartAnnotations}
              isUp={isUp}
              isDark={isDark}
              chartType={chartType}
              hoveredIdx={hoveredIdx}
              onHover={setHoveredIdx}
              onPanStart={handlePanStart}
              onPanDelta={handlePanDelta}
              overlays={overlays}
              showMa={activeIndicators.has("ma")}
              showVolume={activeIndicators.has("volume")}
            />
            {subPanels.map((panel) => (
              <div
                key={panel.id}
                style={{ height: SUB_PANEL_H }}
                className="shrink-0"
              >
                <SubIndicatorChart
                  data={panel}
                  chart={visibleChart}
                  width={containerSize.w}
                  height={SUB_PANEL_H}
                  hoveredIdx={hoveredIdx}
                  isDark={isDark}
                />
              </div>
            ))}
          </>
        ) : !loading ? (
          <div
            className={`flex h-64 items-center justify-center text-sm ${subtleText}`}
          >
            데이터 없음
          </div>
        ) : null}
      </div>
    </section>
  );
}
