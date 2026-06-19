import type { Candle, IndicatorId, ChartOverlays } from "./types";
import type { SubPanelData } from "./types";
import {
  calcRSI, calcMACD, calcStochasticFast, calcBollingerBands,
  calcATR, calcADX, calcIchimoku, calcOBV, calcMFI, calcCMF,
  calcVolumeRatio, calcWilliamsR, calcPsychologicalLine,
  calcDisparity, calcStochasticRSI,
} from "./indicator-calc";

export type SignalDir = "bull" | "bear" | "neutral";
export type SignalStrength = "strong" | "weak";

export interface IndicatorSignal {
  id: string;
  label: string;
  dir: SignalDir;
  strength: SignalStrength;
  value: number | null;
  description: string;
}

export interface StrategyPreset {
  id: string;
  name: string;
  desc: string;
  category: "trend" | "reversal" | "momentum" | "volatility" | "ichimoku" | "volume" | "psychology";
  indicators: IndicatorId[];
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: "ma-trend",
    name: "이동평균 추세",
    desc: "이동평균선 + MACD + ADX로 추세 방향과 강도를 동시에 확인",
    category: "trend",
    indicators: ["ma", "macd", "adx", "volume"],
  },
  {
    id: "bb-reversal",
    name: "볼린저밴드 반전",
    desc: "볼린저밴드 + RSI + Stochastic으로 과매수/과매도 반전 포착",
    category: "reversal",
    indicators: ["bb", "rsi", "stochFast", "volume"],
  },
  {
    id: "ichimoku",
    name: "이치모쿠 클라우드",
    desc: "일목균형표 완전 시스템으로 지지·저항·추세를 한눈에 파악",
    category: "ichimoku",
    indicators: ["ichimoku", "ma", "volume"],
  },
  {
    id: "momentum",
    name: "모멘텀 전략",
    desc: "RSI + Stochastic + MACD 삼중 모멘텀 확인으로 진입 타이밍 포착",
    category: "momentum",
    indicators: ["rsi", "stochFast", "macd", "momentum", "volume"],
  },
  {
    id: "swing",
    name: "스윙 트레이딩",
    desc: "볼린저밴드 + RSI + ATR + MACD로 변동성 기반 스윙 매매",
    category: "volatility",
    indicators: ["bb", "rsi", "atr", "macd", "volume"],
  },
  {
    id: "reversal-detection",
    name: "추세 전환 감지",
    desc: "MACD 다이버전스 + RSI + Stochastic RSI로 추세 전환 조기 감지",
    category: "reversal",
    indicators: ["macd", "rsi", "stochRsi", "atr", "ma"],
  },
  {
    id: "volume-flow",
    name: "거래량 기반 매매",
    desc: "OBV + MFI + CMF로 세력의 매집·분산 흐름을 거래량으로 선행 파악",
    category: "volume",
    indicators: ["obv", "mfi", "cmf", "volumeRatio", "volume"],
  },
  {
    id: "scalping",
    name: "단기 스캘핑",
    desc: "Stochastic + Williams %R + SAR로 빠른 과매수·과매도 반전 타이밍",
    category: "momentum",
    indicators: ["stochFast", "williamsR", "sar", "atr", "volume"],
  },
  {
    id: "psychology",
    name: "한국형 심리 지표",
    desc: "심리선 + 이격도 + 거래량비율로 군중 심리와 평균 이탈도 분석",
    category: "psychology",
    indicators: ["psychLine", "disparity", "volumeRatio", "volume"],
  },
];

const last = (arr: (number | null)[]): number | null =>
  arr.length > 0 ? (arr[arr.length - 1] ?? null) : null;

const prev = (arr: (number | null)[], back = 1): number | null =>
  arr.length > back ? (arr[arr.length - 1 - back] ?? null) : null;

export function computeSignals(
  chart: Candle[],
  activeIndicators: Set<IndicatorId>,
  overlays: ChartOverlays,
  subPanels: SubPanelData[],
  ma7: (number | null)[],
  ma25: (number | null)[],
): IndicatorSignal[] {
  if (chart.length === 0) return [];
  const signals: IndicatorSignal[] = [];
  const latestClose = chart[chart.length - 1].close;

  const findPanel = (id: string) => subPanels.find((p) => p.id === id);

  /* ── 이동평균선 ── */
  if (activeIndicators.has("ma")) {
    const m7  = last(ma7);
    const m25 = last(ma25);
    if (m7 != null && m25 != null) {
      const aboveBoth = latestClose > m7 && latestClose > m25;
      const belowBoth = latestClose < m7 && latestClose < m25;
      const goldCross = m7 > m25 && (prev(ma7) ?? m7) <= (prev(ma25) ?? m25);
      const deadCross = m7 < m25 && (prev(ma7) ?? m7) >= (prev(ma25) ?? m25);
      const dir: SignalDir = goldCross ? "bull" : deadCross ? "bear" : aboveBoth ? "bull" : belowBoth ? "bear" : "neutral";
      signals.push({
        id: "ma", label: "MA7/MA25",
        dir, strength: (goldCross || deadCross) ? "strong" : "weak",
        value: null,
        description: goldCross ? "골든크로스 발생 — 상승 전환 신호"
          : deadCross ? "데드크로스 발생 — 하락 전환 신호"
          : aboveBoth ? `종가 > MA7(${m7.toFixed(0)}) > MA25(${m25.toFixed(0)}) 상승 추세`
          : belowBoth ? `종가 < MA7 < MA25 하락 추세`
          : `MA7·MA25 간 혼조 — 방향성 불명확`,
      });
    }
  }

  /* ── RSI ── */
  const rsiPanel = findPanel("rsi");
  if (rsiPanel) {
    const val = last(rsiPanel.lines[0].values);
    if (val != null) {
      const dir: SignalDir = val < 30 ? "bull" : val > 70 ? "bear" : "neutral";
      const strong = val < 25 || val > 75;
      signals.push({
        id: "rsi", label: "RSI(14)", dir, strength: strong ? "strong" : "weak",
        value: val,
        description: val < 25 ? `강한 과매도 (${val.toFixed(1)}) — 반등 가능성`
          : val < 35 ? `과매도 구간 (${val.toFixed(1)}) — 매수 관심`
          : val > 75 ? `강한 과매수 (${val.toFixed(1)}) — 조정 주의`
          : val > 65 ? `과매수 구간 (${val.toFixed(1)}) — 매도 관심`
          : `중립 구간 (${val.toFixed(1)})`,
      });
    }
  }

  /* ── MACD ── */
  const macdPanel = findPanel("macd");
  if (macdPanel) {
    const macdLine  = macdPanel.lines[0]?.values;
    const sigLine   = macdPanel.lines[1]?.values;
    const histVals  = macdPanel.histBars?.values;
    const histNow   = histVals ? last(histVals) : null;
    const histPrev  = histVals ? prev(histVals) : null;
    const macdNow   = macdLine ? last(macdLine) : null;
    const sigNow    = sigLine  ? last(sigLine)  : null;
    if (macdNow != null && sigNow != null) {
      const bullCross = macdNow > sigNow && (prev(macdLine!) ?? macdNow) <= (prev(sigLine!) ?? sigNow);
      const bearCross = macdNow < sigNow && (prev(macdLine!) ?? macdNow) >= (prev(sigLine!) ?? sigNow);
      const histRising  = histNow != null && histPrev != null && histNow > histPrev && histNow > 0;
      const histFalling = histNow != null && histPrev != null && histNow < histPrev && histNow < 0;
      const dir: SignalDir = bullCross ? "bull" : bearCross ? "bear" : histRising ? "bull" : histFalling ? "bear" : macdNow > sigNow ? "bull" : "bear";
      signals.push({
        id: "macd", label: "MACD", dir,
        strength: (bullCross || bearCross) ? "strong" : "weak",
        value: macdNow,
        description: bullCross ? "MACD 골든크로스 — 강한 매수 신호"
          : bearCross ? "MACD 데드크로스 — 강한 매도 신호"
          : histRising  ? `히스토그램 상승 중 (${histNow?.toFixed(2)}) — 상승 모멘텀`
          : histFalling  ? `히스토그램 하락 중 (${histNow?.toFixed(2)}) — 하락 모멘텀`
          : `Signal선 ${macdNow > sigNow ? "위" : "아래"} — ${macdNow > sigNow ? "약한 강세" : "약한 약세"}`,
      });
    }
  }

  /* ── Stochastic Fast ── */
  const stochPanel = findPanel("stochFast") ?? findPanel("stochSlow");
  if (stochPanel) {
    const kLine = stochPanel.lines[0]?.values;
    const dLine = stochPanel.lines[1]?.values;
    const kNow  = kLine ? last(kLine) : null;
    const dNow  = dLine ? last(dLine) : null;
    if (kNow != null) {
      const dir: SignalDir = kNow < 20 ? "bull" : kNow > 80 ? "bear" : "neutral";
      const kAboveD = dNow != null && kNow > dNow;
      signals.push({
        id: stochPanel.id, label: stochPanel.id === "stochFast" ? "Stochastic Fast" : "Stochastic Slow",
        dir, strength: (kNow < 15 || kNow > 85) ? "strong" : "weak",
        value: kNow,
        description: kNow < 20 ? `과매도 (K: ${kNow.toFixed(1)}) ${kAboveD ? "— %K>%D 반등 시작" : ""}`
          : kNow > 80 ? `과매수 (K: ${kNow.toFixed(1)}) ${!kAboveD ? "— %K<%D 하락 시작" : ""}`
          : `중립 구간 (K: ${kNow.toFixed(1)})`,
      });
    }
  }

  /* ── 볼린저밴드 ── */
  if (overlays.bb) {
    const { upper, lower, middle } = overlays.bb;
    const upperNow  = last(upper);
    const lowerNow  = last(lower);
    const midNow    = last(middle ?? []);
    if (upperNow != null && lowerNow != null) {
      const bandwidth = upperNow - lowerNow;
      const pctB = bandwidth > 0 ? (latestClose - lowerNow) / bandwidth : 0.5;
      const dir: SignalDir = pctB < 0.2 ? "bull" : pctB > 0.8 ? "bear" : "neutral";
      signals.push({
        id: "bb", label: "볼린저밴드",
        dir, strength: (pctB < 0.1 || pctB > 0.9) ? "strong" : "weak",
        value: parseFloat(pctB.toFixed(2)),
        description: pctB < 0.1 ? `하단 밴드 근접 — 강한 과매도, 반등 가능`
          : pctB < 0.25 ? `하단 밴드 근처 (BB%B ${(pctB * 100).toFixed(0)}%) — 매수 관심`
          : pctB > 0.9 ? `상단 밴드 돌파 — 강한 과매수, 조정 가능`
          : pctB > 0.75 ? `상단 밴드 근처 (BB%B ${(pctB * 100).toFixed(0)}%) — 매도 관심`
          : `밴드 중앙부 (BB%B ${(pctB * 100).toFixed(0)}%)${midNow ? ` 중앙 ${midNow.toFixed(0)}` : ""}`,
      });
    }
  }

  /* ── ADX ── */
  const adxPanel = findPanel("adx");
  if (adxPanel) {
    const adxLine    = adxPanel.lines[0]?.values; // ADX
    const plusDILine = adxPanel.lines[1]?.values; // +DI
    const minusDILine= adxPanel.lines[2]?.values; // -DI
    const adxVal   = adxLine    ? last(adxLine)    : null;
    const plusDI   = plusDILine  ? last(plusDILine)  : null;
    const minusDI  = minusDILine ? last(minusDILine) : null;
    if (adxVal != null) {
      const trending = adxVal > 25;
      const dir: SignalDir = !trending ? "neutral" : (plusDI != null && minusDI != null) ? (plusDI > minusDI ? "bull" : "bear") : "neutral";
      signals.push({
        id: "adx", label: "ADX/DMI",
        dir, strength: adxVal > 40 ? "strong" : "weak",
        value: adxVal,
        description: adxVal < 20 ? `ADX ${adxVal.toFixed(1)} — 추세 약함, 횡보 가능`
          : adxVal < 25 ? `ADX ${adxVal.toFixed(1)} — 추세 형성 초기`
          : plusDI != null && minusDI != null
            ? `ADX ${adxVal.toFixed(1)} 강한 추세 · +DI(${plusDI.toFixed(1)}) ${plusDI > minusDI ? ">" : "<"} -DI(${minusDI.toFixed(1)}) → ${plusDI > minusDI ? "상승 추세" : "하락 추세"}`
            : `ADX ${adxVal.toFixed(1)} — 추세 강함`,
      });
    }
  }

  /* ── ATR (변동성 정보용) ── */
  const atrPanel = findPanel("atr");
  if (atrPanel) {
    const val = last(atrPanel.lines[0].values);
    if (val != null) {
      const atrPct = (val / latestClose) * 100;
      signals.push({
        id: "atr", label: "ATR(14)",
        dir: "neutral", strength: "weak",
        value: val,
        description: `ATR ${val.toFixed(1)} (현재가의 ${atrPct.toFixed(1)}%) — 일평균 변동폭 참고`,
      });
    }
  }

  /* ── Ichimoku ── */
  if (overlays.ichimoku) {
    const { tenkan, kijun, senkouA, senkouB } = overlays.ichimoku;
    const t = last(tenkan), k = last(kijun), sA = last(senkouA), sB = last(senkouB);
    if (t != null && k != null) {
      const cloudTop = sA != null && sB != null ? Math.max(sA, sB) : null;
      const cloudBot = sA != null && sB != null ? Math.min(sA, sB) : null;
      const aboveCloud = cloudTop != null && latestClose > cloudTop;
      const belowCloud = cloudBot != null && latestClose < cloudBot;
      const tkBull = t > k;
      const dir: SignalDir = aboveCloud && tkBull ? "bull" : belowCloud && !tkBull ? "bear" : "neutral";
      signals.push({
        id: "ichimoku", label: "일목균형표",
        dir, strength: (aboveCloud || belowCloud) ? "strong" : "weak",
        value: null,
        description: aboveCloud ? `구름대 위 (전환선 ${t.toFixed(0)} ${tkBull ? ">" : "<"} 기준선 ${k.toFixed(0)}) — ${tkBull ? "강한 상승" : "상승세이나 주의"}`
          : belowCloud ? `구름대 아래 (전환선 ${t.toFixed(0)} ${tkBull ? ">" : "<"} 기준선 ${k.toFixed(0)}) — ${!tkBull ? "강한 하락" : "하락세이나 주의"}`
          : `구름대 내부 (전환선 ${t.toFixed(0)}, 기준선 ${k.toFixed(0)}) — 방향 미결`,
      });
    }
  }

  /* ── Stochastic RSI ── */
  const stochRsiPanel = findPanel("stochRsi");
  if (stochRsiPanel) {
    const kLine = stochRsiPanel.lines[0]?.values;
    const kNow  = kLine ? last(kLine) : null;
    if (kNow != null) {
      const dir: SignalDir = kNow < 20 ? "bull" : kNow > 80 ? "bear" : "neutral";
      signals.push({
        id: "stochRsi", label: "Stoch RSI",
        dir, strength: (kNow < 10 || kNow > 90) ? "strong" : "weak",
        value: kNow,
        description: kNow < 20 ? `과매도 (${kNow.toFixed(1)}) — 강한 반등 가능성`
          : kNow > 80 ? `과매수 (${kNow.toFixed(1)}) — 하락 조정 주의`
          : `중립 (${kNow.toFixed(1)})`,
      });
    }
  }

  /* ── OBV ── */
  const obvPanel = findPanel("obv");
  if (obvPanel && obvPanel.lines[0]) {
    const vals = obvPanel.lines[0].values;
    const n1 = last(vals), n5 = prev(vals, 5);
    if (n1 != null && n5 != null) {
      const dir: SignalDir = n1 > n5 * 1.01 ? "bull" : n1 < n5 * 0.99 ? "bear" : "neutral";
      signals.push({
        id: "obv", label: "OBV",
        dir, strength: "weak",
        value: null,
        description: dir === "bull" ? "OBV 5일 상승 — 매수세 우위"
          : dir === "bear" ? "OBV 5일 하락 — 매도세 우위"
          : "OBV 횡보 — 뚜렷한 매수/매도세 없음",
      });
    }
  }

  /* ── MFI (Money Flow Index) ── */
  const mfiPanel = findPanel("mfi");
  if (mfiPanel && mfiPanel.lines[0]) {
    const val = last(mfiPanel.lines[0].values);
    if (val != null) {
      const dir: SignalDir = val < 20 ? "bull" : val > 80 ? "bear" : "neutral";
      signals.push({
        id: "mfi", label: "MFI(14)",
        dir, strength: (val < 15 || val > 85) ? "strong" : "weak",
        value: val,
        description: val < 20 ? `자금 유출 과다 (${val.toFixed(1)}) — 세력 매집 가능성`
          : val > 80 ? `자금 유입 과다 (${val.toFixed(1)}) — 세력 분산 가능성`
          : `중립 (${val.toFixed(1)})`,
      });
    }
  }

  /* ── CMF (Chaikin Money Flow) ── */
  const cmfPanel = findPanel("cmf");
  if (cmfPanel && cmfPanel.lines[0]) {
    const val = last(cmfPanel.lines[0].values);
    if (val != null) {
      const dir: SignalDir = val > 0.05 ? "bull" : val < -0.05 ? "bear" : "neutral";
      signals.push({
        id: "cmf", label: "CMF(20)",
        dir, strength: Math.abs(val) > 0.15 ? "strong" : "weak",
        value: val,
        description: val > 0.15 ? `강한 매집 흐름 (${val.toFixed(2)}) — 상승 자금 유입`
          : val > 0.05 ? `약한 매집 (${val.toFixed(2)}) — 긍정적 자금 흐름`
          : val < -0.15 ? `강한 분산 흐름 (${val.toFixed(2)}) — 하락 자금 유출`
          : val < -0.05 ? `약한 분산 (${val.toFixed(2)}) — 부정적 자금 흐름`
          : `중립 (${val.toFixed(2)}) — 방향성 없음`,
      });
    }
  }

  /* ── Volume Ratio ── */
  const vrPanel = findPanel("volumeRatio");
  if (vrPanel && vrPanel.lines[0]) {
    const val = last(vrPanel.lines[0].values);
    if (val != null) {
      const dir: SignalDir = val > 130 ? "bull" : val < 70 ? "bear" : "neutral";
      signals.push({
        id: "volumeRatio", label: "거래량비율",
        dir, strength: (val > 180 || val < 50) ? "strong" : "weak",
        value: val,
        description: val > 180 ? `매우 활발한 거래 (${val.toFixed(0)}%) — 강한 매수세`
          : val > 130 ? `거래 활발 (${val.toFixed(0)}%) — 매수 우위`
          : val < 50 ? `매우 저조한 거래 (${val.toFixed(0)}%) — 매도세 우위`
          : val < 70 ? `거래 저조 (${val.toFixed(0)}%) — 관망 또는 매도`
          : `거래량 보통 (${val.toFixed(0)}%)`,
      });
    }
  }

  /* ── Williams %R ── */
  const wrPanel = findPanel("williamsR");
  if (wrPanel && wrPanel.lines[0]) {
    const val = last(wrPanel.lines[0].values);
    if (val != null) {
      const dir: SignalDir = val < -80 ? "bull" : val > -20 ? "bear" : "neutral";
      signals.push({
        id: "williamsR", label: "Williams %R",
        dir, strength: (val < -90 || val > -10) ? "strong" : "weak",
        value: val,
        description: val < -80 ? `과매도 (${val.toFixed(1)}) — 단기 반등 가능성`
          : val > -20 ? `과매수 (${val.toFixed(1)}) — 단기 하락 주의`
          : `중립 구간 (${val.toFixed(1)})`,
      });
    }
  }

  /* ── Psychological Line (심리선) ── */
  const plPanel = findPanel("psychLine");
  if (plPanel && plPanel.lines[0]) {
    const val = last(plPanel.lines[0].values);
    if (val != null) {
      const dir: SignalDir = val < 25 ? "bull" : val > 75 ? "bear" : "neutral";
      signals.push({
        id: "psychLine", label: "심리선",
        dir, strength: (val < 20 || val > 80) ? "strong" : "weak",
        value: val,
        description: val < 20 ? `극단적 비관 (${val.toFixed(0)}%) — 군중 공포, 역발상 매수 시점`
          : val < 30 ? `비관 우위 (${val.toFixed(0)}%) — 하락 일수 많음`
          : val > 80 ? `극단적 낙관 (${val.toFixed(0)}%) — 군중 과열, 역발상 매도 시점`
          : val > 70 ? `낙관 우위 (${val.toFixed(0)}%) — 상승 일수 많음`
          : `중립 (${val.toFixed(0)}%)`,
      });
    }
  }

  /* ── Disparity (이격도) ── */
  const disparityPanel = findPanel("disparity");
  if (disparityPanel && disparityPanel.lines[0]) {
    const val = last(disparityPanel.lines[0].values);
    if (val != null) {
      const dev = val - 100;
      const dir: SignalDir = dev < -5 ? "bull" : dev > 5 ? "bear" : "neutral";
      signals.push({
        id: "disparity", label: "이격도",
        dir, strength: Math.abs(dev) > 10 ? "strong" : "weak",
        value: val,
        description: dev < -10 ? `강한 과매도 이격 (${dev.toFixed(1)}%) — 평균 복귀 매수`
          : dev < -5 ? `과매도 이격 (${dev.toFixed(1)}%) — 단기 반등 기대`
          : dev > 10 ? `강한 과매수 이격 (+${dev.toFixed(1)}%) — 평균 복귀 매도`
          : dev > 5 ? `과매수 이격 (+${dev.toFixed(1)}%) — 단기 조정 주의`
          : `정상 이격 (${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%)`,
      });
    }
  }

  return signals;
}

/** 캔들 데이터에서 직접 계산 — activeIndicators/subPanels 불필요 */
export function computePresetConclusion(
  chart: Candle[],
  ma7: (number | null)[],
  ma25: (number | null)[],
  indicators: IndicatorId[],
): ReturnType<typeof computeConclusion> | null {
  if (chart.length < 14) return null;
  const set = new Set<string>(indicators);
  const closes = chart.map((c) => c.close);
  const latestClose = closes[closes.length - 1];
  const sigs: IndicatorSignal[] = [];

  const tip = <T>(arr: (T | null)[]): T | null => arr.length > 0 ? arr[arr.length - 1] ?? null : null;

  /* MA */
  if (set.has("ma")) {
    const m7 = tip(ma7), m25 = tip(ma25);
    if (m7 != null && m25 != null) {
      const dir: SignalDir = latestClose > m7 && m7 > m25 ? "bull" : latestClose < m7 && m7 < m25 ? "bear" : "neutral";
      sigs.push({ id: "ma", label: "MA", dir, strength: "weak", value: null, description: "" });
    }
  }

  /* RSI */
  if (set.has("rsi")) {
    const val = tip(calcRSI(closes));
    if (val != null) {
      const dir: SignalDir = val < 30 ? "bull" : val > 70 ? "bear" : "neutral";
      sigs.push({ id: "rsi", label: "RSI", dir, strength: val < 25 || val > 75 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* MACD */
  if (set.has("macd")) {
    const { macd, signal: sigLine } = calcMACD(closes);
    const m = tip(macd), s = tip(sigLine);
    if (m != null && s != null) {
      const dir: SignalDir = m > s ? "bull" : m < s ? "bear" : "neutral";
      sigs.push({ id: "macd", label: "MACD", dir, strength: "weak", value: m, description: "" });
    }
  }

  /* Stochastic Fast */
  if (set.has("stochFast")) {
    const { k } = calcStochasticFast(chart);
    const val = tip(k);
    if (val != null) {
      const dir: SignalDir = val < 20 ? "bull" : val > 80 ? "bear" : "neutral";
      sigs.push({ id: "stochFast", label: "Stoch", dir, strength: val < 15 || val > 85 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* Bollinger Bands */
  if (set.has("bb")) {
    const { upper, lower } = calcBollingerBands(closes);
    const u = tip(upper), l = tip(lower);
    if (u != null && l != null && u > l) {
      const pctB = (latestClose - l) / (u - l);
      const dir: SignalDir = pctB < 0.2 ? "bull" : pctB > 0.8 ? "bear" : "neutral";
      sigs.push({ id: "bb", label: "BB", dir, strength: pctB < 0.1 || pctB > 0.9 ? "strong" : "weak", value: pctB, description: "" });
    }
  }

  /* ADX */
  if (set.has("adx")) {
    const { adx, plusDI, minusDI } = calcADX(chart);
    const a = tip(adx), p = tip(plusDI), mi = tip(minusDI);
    if (a != null) {
      const dir: SignalDir = a < 20 ? "neutral" : p != null && mi != null ? (p > mi ? "bull" : "bear") : "neutral";
      sigs.push({ id: "adx", label: "ADX", dir, strength: a > 40 ? "strong" : "weak", value: a, description: "" });
    }
  }

  /* ATR — 방향 없음, 중립으로만 포함 */
  if (set.has("atr")) {
    const val = tip(calcATR(chart));
    if (val != null)
      sigs.push({ id: "atr", label: "ATR", dir: "neutral", strength: "weak", value: val, description: "" });
  }

  /* Ichimoku */
  if (set.has("ichimoku")) {
    const { senkouA, senkouB } = calcIchimoku(chart);
    const sA = tip(senkouA), sB = tip(senkouB);
    if (sA != null && sB != null) {
      const top = Math.max(sA, sB), bot = Math.min(sA, sB);
      const dir: SignalDir = latestClose > top ? "bull" : latestClose < bot ? "bear" : "neutral";
      sigs.push({ id: "ichimoku", label: "이치모쿠", dir, strength: dir !== "neutral" ? "strong" : "weak", value: null, description: "" });
    }
  }

  /* Stochastic RSI */
  if (set.has("stochRsi")) {
    const { k } = calcStochasticRSI(closes);
    const val = tip(k);
    if (val != null) {
      const dir: SignalDir = val < 20 ? "bull" : val > 80 ? "bear" : "neutral";
      sigs.push({ id: "stochRsi", label: "StochRSI", dir, strength: val < 10 || val > 90 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* OBV */
  if (set.has("obv")) {
    const vals = calcOBV(chart);
    const n1 = tip(vals), n5 = vals.length > 5 ? (vals[vals.length - 6] ?? null) : null;
    if (n1 != null && n5 != null) {
      const dir: SignalDir = n1 > n5 * 1.01 ? "bull" : n1 < n5 * 0.99 ? "bear" : "neutral";
      sigs.push({ id: "obv", label: "OBV", dir, strength: "weak", value: null, description: "" });
    }
  }

  /* MFI */
  if (set.has("mfi")) {
    const val = tip(calcMFI(chart));
    if (val != null) {
      const dir: SignalDir = val < 20 ? "bull" : val > 80 ? "bear" : "neutral";
      sigs.push({ id: "mfi", label: "MFI", dir, strength: val < 15 || val > 85 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* CMF */
  if (set.has("cmf")) {
    const val = tip(calcCMF(chart));
    if (val != null) {
      const dir: SignalDir = val > 0.05 ? "bull" : val < -0.05 ? "bear" : "neutral";
      sigs.push({ id: "cmf", label: "CMF", dir, strength: Math.abs(val) > 0.15 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* Volume Ratio */
  if (set.has("volumeRatio")) {
    const val = tip(calcVolumeRatio(chart));
    if (val != null) {
      const dir: SignalDir = val > 130 ? "bull" : val < 70 ? "bear" : "neutral";
      sigs.push({ id: "volumeRatio", label: "거래량비율", dir, strength: val > 180 || val < 50 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* Williams %R */
  if (set.has("williamsR")) {
    const val = tip(calcWilliamsR(chart));
    if (val != null) {
      const dir: SignalDir = val < -80 ? "bull" : val > -20 ? "bear" : "neutral";
      sigs.push({ id: "williamsR", label: "Williams%R", dir, strength: val < -90 || val > -10 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* Psychological Line */
  if (set.has("psychLine")) {
    const val = tip(calcPsychologicalLine(chart));
    if (val != null) {
      const dir: SignalDir = val < 25 ? "bull" : val > 75 ? "bear" : "neutral";
      sigs.push({ id: "psychLine", label: "심리선", dir, strength: val < 20 || val > 80 ? "strong" : "weak", value: val, description: "" });
    }
  }

  /* Disparity */
  if (set.has("disparity")) {
    const val = tip(calcDisparity(closes));
    if (val != null) {
      const dev = val - 100;
      const dir: SignalDir = dev < -5 ? "bull" : dev > 5 ? "bear" : "neutral";
      sigs.push({ id: "disparity", label: "이격도", dir, strength: Math.abs(dev) > 10 ? "strong" : "weak", value: val, description: "" });
    }
  }

  if (sigs.length === 0) return null;
  return computeConclusion(sigs);
}

export function computeConclusion(signals: IndicatorSignal[]): {
  dir: SignalDir;
  label: string;
  bullCount: number;
  bearCount: number;
  neutralCount: number;
} {
  let bullCount = 0, bearCount = 0, neutralCount = 0;
  signals.forEach((s) => {
    const weight = s.strength === "strong" ? 2 : 1;
    if (s.dir === "bull") bullCount += weight;
    else if (s.dir === "bear") bearCount += weight;
    else neutralCount += weight;
  });
  const total = bullCount + bearCount + neutralCount;
  const bullPct = total > 0 ? bullCount / total : 0;
  const bearPct = total > 0 ? bearCount / total : 0;

  let dir: SignalDir = "neutral";
  let label = "중립 — 방향성 불명확";
  if      (bullPct >= 0.7)  { dir = "bull"; label = "강한 매수 신호"; }
  else if (bullPct >= 0.55) { dir = "bull"; label = "약한 매수 신호"; }
  else if (bearPct >= 0.7)  { dir = "bear"; label = "강한 매도 신호"; }
  else if (bearPct >= 0.55) { dir = "bear"; label = "약한 매도 신호"; }
  else if (bullPct > bearPct) { dir = "bull"; label = "약한 매수 우위"; }
  else if (bearPct > bullPct) { dir = "bear"; label = "약한 매도 우위"; }

  const rawBull = signals.filter((s) => s.dir === "bull").length;
  const rawBear = signals.filter((s) => s.dir === "bear").length;
  const rawNeutral = signals.filter((s) => s.dir === "neutral").length;
  return { dir, label, bullCount: rawBull, bearCount: rawBear, neutralCount: rawNeutral };
}
