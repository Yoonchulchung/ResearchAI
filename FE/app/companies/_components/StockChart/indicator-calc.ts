import type { Candle } from "./types";

/* ── 공통 ─────────────────────────────────────────────────── */
type N = number | null;
const v = (x: N) => (x != null ? x : 0);

function sma(data: N[], period: number): N[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    if (slice.some((x) => x == null)) return null;
    return slice.reduce<number>((s, x) => s + v(x), 0) / period;
  });
}

function ema(data: N[], period: number): N[] {
  const k = 2 / (period + 1);
  const result: N[] = [];
  let prev: N = null;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d == null) { result.push(null); continue; }
    if (prev == null) {
      if (i < period - 1) { result.push(null); continue; }
      // 첫 EMA = SMA
      const slice = data.slice(i - period + 1, i + 1);
      if (slice.some((x) => x == null)) { result.push(null); continue; }
      prev = slice.reduce<number>((s, x) => s + v(x), 0) / period;
      result.push(prev);
    } else {
      prev = d * k + prev * (1 - k);
      result.push(prev);
    }
  }
  return result;
}

function stdev(data: N[], period: number): N[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    if (slice.some((x) => x == null)) return null;
    const mean = slice.reduce<number>((s, x) => s + v(x), 0) / period;
    const variance = slice.reduce<number>((s, x) => s + (v(x) - mean) ** 2, 0) / period;
    return Math.sqrt(variance);
  });
}

function truRange(candles: Candle[]): N[] {
  return candles.map((d, i) => {
    const prevClose = i > 0 ? candles[i - 1].close : null;
    const hl = (d.high ?? d.close) - (d.low ?? d.close);
    if (prevClose == null) return hl;
    return Math.max(hl, Math.abs((d.high ?? d.close) - prevClose), Math.abs((d.low ?? d.close) - prevClose));
  });
}

/* ── 오버레이 지표 ─────────────────────────────────────────── */

export function calcBollingerBands(closes: N[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const sd  = stdev(closes, period);
  return {
    upper:  mid.map((m, i) => m != null && sd[i] != null ? m + mult * v(sd[i]) : null),
    middle: mid,
    lower:  mid.map((m, i) => m != null && sd[i] != null ? m - mult * v(sd[i]) : null),
  };
}

export function calcEnvelope(closes: N[], period = 20, pct = 3) {
  const mid = sma(closes, period);
  const f   = pct / 100;
  return {
    upper:  mid.map((m) => m != null ? m * (1 + f) : null),
    middle: mid,
    lower:  mid.map((m) => m != null ? m * (1 - f) : null),
  };
}

export function calcPriceChannel(candles: Candle[], period = 20) {
  return {
    upper: candles.map((_, i) => {
      if (i < period - 1) return null;
      return Math.max(...candles.slice(i - period + 1, i + 1).map((d) => d.high ?? d.close));
    }),
    lower: candles.map((_, i) => {
      if (i < period - 1) return null;
      return Math.min(...candles.slice(i - period + 1, i + 1).map((d) => d.low ?? d.close));
    }),
  };
}

export function calcVWAP(candles: Candle[]): N[] {
  let cumPV = 0, cumV = 0;
  return candles.map((d) => {
    const tp  = ((d.high ?? d.close) + (d.low ?? d.close) + d.close) / 3;
    const vol = d.volume ?? 0;
    cumPV += tp * vol;
    cumV  += vol;
    return cumV > 0 ? cumPV / cumV : null;
  });
}

export function calcParabolicSAR(candles: Candle[], step = 0.02, max = 0.2): N[] {
  if (candles.length < 2) return candles.map(() => null);
  const result: N[] = [null];
  let bull  = true;
  let sar   = candles[0].low  ?? candles[0].close;
  let ep    = candles[0].high ?? candles[0].close;
  let af    = step;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const h = c.high ?? c.close;
    const l = c.low  ?? c.close;
    let newSar = sar + af * (ep - sar);

    if (bull) {
      if (l < newSar) {
        // 반전: 매도
        bull   = false;
        newSar = ep;
        ep     = l;
        af     = step;
      } else {
        if (h > ep) { ep = h; af = Math.min(af + step, max); }
        newSar = Math.min(newSar, (candles[i - 1].low ?? candles[i - 1].close), i > 1 ? (candles[i - 2].low ?? candles[i - 2].close) : newSar);
      }
    } else {
      if (h > newSar) {
        // 반전: 매수
        bull   = true;
        newSar = ep;
        ep     = h;
        af     = step;
      } else {
        if (l < ep) { ep = l; af = Math.min(af + step, max); }
        newSar = Math.max(newSar, (candles[i - 1].high ?? candles[i - 1].close), i > 1 ? (candles[i - 2].high ?? candles[i - 2].close) : newSar);
      }
    }
    sar = newSar;
    result.push(sar);
  }
  return result;
}

export function calcIchimoku(candles: Candle[]) {
  const tenkan = (n: number) => candles.map((_, i) => {
    if (i < n - 1) return null;
    const slice = candles.slice(i - n + 1, i + 1);
    return (Math.max(...slice.map((d) => d.high ?? d.close)) + Math.min(...slice.map((d) => d.low ?? d.close))) / 2;
  });
  const t = tenkan(9);
  const k = tenkan(26);
  const senkouA: N[] = t.map((tv, i) => tv != null && k[i] != null ? (v(tv) + v(k[i])) / 2 : null);
  const senkouB: N[] = candles.map((_, i) => {
    if (i < 51) return null;
    const slice = candles.slice(i - 51, i + 1);
    return (Math.max(...slice.map((d) => d.high ?? d.close)) + Math.min(...slice.map((d) => d.low ?? d.close))) / 2;
  });
  return { tenkan: t, kijun: k, senkouA, senkouB };
}

/* ── 서브패널 지표 ─────────────────────────────────────────── */

export function calcRSI(closes: N[], period = 14): N[] {
  const result: N[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { result.push(null); continue; }
    const diff = v(closes[i]) - v(closes[i - 1]);
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (i === period) {
      // 첫 평균 = 단순 평균
      let g = 0, l = 0;
      for (let j = 1; j <= period; j++) {
        const d = v(closes[j]) - v(closes[j - 1]);
        g += Math.max(d, 0);
        l += Math.max(-d, 0);
      }
      avgGain = g / period;
      avgLoss = l / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

export function calcMACD(closes: N[], fast = 12, slow = 26, signal = 9) {
  const emaF = ema(closes, fast);
  const emaS = ema(closes, slow);
  const macdLine = emaF.map((f, i) => f != null && emaS[i] != null ? v(f) - v(emaS[i]) : null);
  const sigLine  = ema(macdLine, signal);
  const hist     = macdLine.map((m, i) => m != null && sigLine[i] != null ? v(m) - v(sigLine[i]) : null);
  return { macd: macdLine, signal: sigLine, histogram: hist };
}

function stochasticRaw(candles: Candle[], kPeriod = 14): N[] {
  return candles.map((_, i) => {
    if (i < kPeriod - 1) return null;
    const slice  = candles.slice(i - kPeriod + 1, i + 1);
    const high   = Math.max(...slice.map((d) => d.high ?? d.close));
    const low    = Math.min(...slice.map((d) => d.low  ?? d.close));
    const close  = candles[i].close;
    return high === low ? 50 : ((close - low) / (high - low)) * 100;
  });
}

export function calcStochasticFast(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  const k = stochasticRaw(candles, kPeriod);
  return { k, d: sma(k, dPeriod) };
}

export function calcStochasticSlow(candles: Candle[], kPeriod = 14, dPeriod = 3, slowing = 3) {
  const rawK  = stochasticRaw(candles, kPeriod);
  const slowK = sma(rawK, slowing);
  return { k: slowK, d: sma(slowK, dPeriod) };
}

export function calcCCI(candles: Candle[], period = 20): N[] {
  const tp = candles.map((d) => ((d.high ?? d.close) + (d.low ?? d.close) + d.close) / 3);
  return tp.map((t, i) => {
    if (i < period - 1) return null;
    const slice = tp.slice(i - period + 1, i + 1);
    const mean  = slice.reduce((s, x) => s + x, 0) / period;
    const mad   = slice.reduce((s, x) => s + Math.abs(x - mean), 0) / period;
    return mad === 0 ? 0 : (t - mean) / (0.015 * mad);
  });
}

export function calcMomentum(closes: N[], period = 10): N[] {
  return closes.map((c, i) => (c != null && closes[i - period] != null ? v(c) - v(closes[i - period]) : null));
}

export function calcROC(closes: N[], period = 12): N[] {
  return closes.map((c, i) => {
    const prev = closes[i - period];
    return c != null && prev != null && prev !== 0 ? ((v(c) - v(prev)) / v(prev)) * 100 : null;
  });
}

export function calcATR(candles: Candle[], period = 14): N[] {
  return sma(truRange(candles), period);
}

export function calcOBV(candles: Candle[]): N[] {
  let obv = 0;
  return candles.map((d, i) => {
    if (i === 0) return 0;
    const diff = d.close - candles[i - 1].close;
    obv += diff > 0 ? (d.volume ?? 0) : diff < 0 ? -(d.volume ?? 0) : 0;
    return obv;
  });
}

export function calcMFI(candles: Candle[], period = 14): N[] {
  const tp  = candles.map((d) => ((d.high ?? d.close) + (d.low ?? d.close) + d.close) / 3);
  const rmf = tp.map((t, i) => t * (candles[i].volume ?? 0));
  return tp.map((t, i) => {
    if (i < period) return null;
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) posFlow += rmf[j];
      else negFlow += rmf[j];
    }
    return negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
  });
}

export function calcCMF(candles: Candle[], period = 20): N[] {
  const mfv = candles.map((d) => {
    const hl = (d.high ?? d.close) - (d.low ?? d.close);
    const clv = hl === 0 ? 0 : ((d.close - (d.low ?? d.close)) - ((d.high ?? d.close) - d.close)) / hl;
    return clv * (d.volume ?? 0);
  });
  const vol = candles.map((d) => d.volume ?? 0);
  return mfv.map((_, i) => {
    if (i < period - 1) return null;
    const sumMFV = mfv.slice(i - period + 1, i + 1).reduce((s, x) => s + x, 0);
    const sumVol = vol.slice(i - period + 1, i + 1).reduce((s, x) => s + x, 0);
    return sumVol === 0 ? 0 : sumMFV / sumVol;
  });
}

export function calcWilliamsR(candles: Candle[], period = 14): N[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const slice = candles.slice(i - period + 1, i + 1);
    const high  = Math.max(...slice.map((d) => d.high ?? d.close));
    const low   = Math.min(...slice.map((d) => d.low  ?? d.close));
    return high === low ? -50 : ((high - candles[i].close) / (high - low)) * -100;
  });
}

export function calcADX(candles: Candle[], period = 14) {
  const tr = truRange(candles);
  const upMove   = candles.map((d, i) => i === 0 ? 0 : Math.max((d.high ?? d.close) - (candles[i-1].high ?? candles[i-1].close), 0));
  const downMove = candles.map((d, i) => i === 0 ? 0 : Math.max((candles[i-1].low ?? candles[i-1].close) - (d.low ?? d.close), 0));
  const plusDM   = upMove.map((u, i) => u > downMove[i] ? u : 0);
  const minusDM  = downMove.map((d, i) => d > upMove[i] ? d : 0);
  const atr14    = ema(tr, period);
  const plusDI   = ema(plusDM, period).map((p, i) => atr14[i] != null && atr14[i]! > 0 ? (v(p) / atr14[i]!) * 100 : null);
  const minusDI  = ema(minusDM, period).map((m, i) => atr14[i] != null && atr14[i]! > 0 ? (v(m) / atr14[i]!) * 100 : null);
  const dx = plusDI.map((p, i) => {
    const m = minusDI[i];
    if (p == null || m == null) return null;
    const sum = v(p) + v(m);
    return sum === 0 ? 0 : (Math.abs(v(p) - v(m)) / sum) * 100;
  });
  const adx = ema(dx, period);
  return { plusDI, minusDI, adx };
}

export function calcAroon(candles: Candle[], period = 25) {
  return {
    up:   candles.map((_, i) => {
      if (i < period) return null;
      const slice = candles.slice(i - period, i + 1);
      const maxIdx = slice.reduce((best, d, j) => (d.high ?? d.close) > (slice[best].high ?? slice[best].close) ? j : best, 0);
      return ((maxIdx) / period) * 100;
    }),
    down: candles.map((_, i) => {
      if (i < period) return null;
      const slice = candles.slice(i - period, i + 1);
      const minIdx = slice.reduce((best, d, j) => (d.low ?? d.close) < (slice[best].low ?? slice[best].close) ? j : best, 0);
      return ((minIdx) / period) * 100;
    }),
  };
}

function stochasticRawFromValues(values: N[], period: number): N[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1).filter((x): x is number => x != null);
    if (slice.length < period) return null;
    const high  = Math.max(...slice);
    const low   = Math.min(...slice);
    const close = values[i];
    if (close == null) return null;
    return high === low ? 50 : ((close - low) / (high - low)) * 100;
  });
}

export function calcStochasticRSI(closes: N[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const rsi    = calcRSI(closes, rsiPeriod);
  const k      = stochasticRawFromValues(rsi, stochPeriod);
  const smoothK = sma(k, kSmooth);
  return { k: smoothK, d: sma(smoothK, dSmooth) };
}

export function calcTRIX(closes: N[], period = 15): N[] {
  const e1 = ema(closes, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  return e3.map((c, i) => {
    const prev = e3[i - 1];
    return c != null && prev != null && prev !== 0 ? ((v(c) - v(prev)) / v(prev)) * 100 : null;
  });
}

export function calcElderRay(candles: Candle[], period = 13) {
  const ema13 = ema(candles.map((d) => d.close), period);
  return {
    bull: candles.map((d, i) => ema13[i] != null ? (d.high ?? d.close) - v(ema13[i]) : null),
    bear: candles.map((d, i) => ema13[i] != null ? (d.low  ?? d.close) - v(ema13[i]) : null),
  };
}

export function calcChaikinOscillator(candles: Candle[], fast = 3, slow = 10): N[] {
  const adl = calcADLine(candles);
  const fastEma = ema(adl, fast);
  const slowEma = ema(adl, slow);
  return fastEma.map((f, i) => f != null && slowEma[i] != null ? v(f) - v(slowEma[i]) : null);
}

export function calcADLine(candles: Candle[]): N[] {
  let adl = 0;
  return candles.map((d) => {
    const hl = (d.high ?? d.close) - (d.low ?? d.close);
    const clv = hl === 0 ? 0 : ((d.close - (d.low ?? d.close)) - ((d.high ?? d.close) - d.close)) / hl;
    adl += clv * (d.volume ?? 0);
    return adl;
  });
}

export function calcChaikinVolatility(candles: Candle[], period = 10, roc = 10): N[] {
  const hl  = candles.map((d) => (d.high ?? d.close) - (d.low ?? d.close));
  const emaHL = ema(hl, period);
  return emaHL.map((e, i) => {
    const prev = emaHL[i - roc];
    return e != null && prev != null && prev !== 0 ? ((v(e) - v(prev)) / v(prev)) * 100 : null;
  });
}

export function calcMassIndex(candles: Candle[], period = 25): N[] {
  const hl    = candles.map((d) => (d.high ?? d.close) - (d.low ?? d.close));
  const ema9  = ema(hl, 9);
  const ema99 = ema(ema9, 9);
  const ratio = ema9.map((e, i) => e != null && ema99[i] != null && v(ema99[i]) !== 0 ? v(e) / v(ema99[i]) : null);
  return ratio.map((_, i) => {
    if (i < period - 1) return null;
    const slice = ratio.slice(i - period + 1, i + 1);
    if (slice.some((x) => x == null)) return null;
    return slice.reduce<number>((s, x) => s + v(x), 0);
  });
}

export function calcUltimateOscillator(candles: Candle[], p1 = 7, p2 = 14, p3 = 28): N[] {
  const bp  = candles.map((d, i) => {
    const prevClose = i > 0 ? candles[i - 1].close : d.close;
    return d.close - Math.min(d.low ?? d.close, prevClose);
  });
  const tr2 = truRange(candles).map((t) => v(t));
  const sum = (arr: number[], period: number, i: number) =>
    arr.slice(Math.max(0, i - period + 1), i + 1).reduce((s, x) => s + x, 0);
  return candles.map((_, i) => {
    if (i < p3 - 1) return null;
    const avg1 = sum(tr2, p1, i) === 0 ? 0 : sum(bp, p1, i) / sum(tr2, p1, i);
    const avg2 = sum(tr2, p2, i) === 0 ? 0 : sum(bp, p2, i) / sum(tr2, p2, i);
    const avg3 = sum(tr2, p3, i) === 0 ? 0 : sum(bp, p3, i) / sum(tr2, p3, i);
    return 100 * (4 * avg1 + 2 * avg2 + avg3) / 7;
  });
}

export function calcForceIndex(candles: Candle[], period = 13): N[] {
  const fi = candles.map((d, i) => {
    if (i === 0) return 0;
    return (d.close - candles[i - 1].close) * (d.volume ?? 0);
  });
  return ema(fi, period);
}

export function calcPVO(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const vol = candles.map((d) => d.volume ?? 0);
  const emaF = ema(vol, fast);
  const emaS = ema(vol, slow);
  const pvo  = emaF.map((f, i) => f != null && emaS[i] != null && v(emaS[i]) !== 0 ? ((v(f) - v(emaS[i])) / v(emaS[i])) * 100 : null);
  const sig  = ema(pvo, signal);
  const hist = pvo.map((p, i) => p != null && sig[i] != null ? v(p) - v(sig[i]) : null);
  return { pvo, signal: sig, histogram: hist };
}

export function calcPPO(closes: N[], fast = 12, slow = 26, signal = 9) {
  const emaF = ema(closes, fast);
  const emaS = ema(closes, slow);
  const ppo  = emaF.map((f, i) => f != null && emaS[i] != null && v(emaS[i]) !== 0 ? ((v(f) - v(emaS[i])) / v(emaS[i])) * 100 : null);
  const sig  = ema(ppo, signal);
  const hist = ppo.map((p, i) => p != null && sig[i] != null ? v(p) - v(sig[i]) : null);
  return { ppo, signal: sig, histogram: hist };
}

export function calcPVI(candles: Candle[]): N[] {
  let pvi = 1000;
  return candles.map((d, i) => {
    if (i === 0) return pvi;
    const vol     = d.volume ?? 0;
    const prevVol = candles[i - 1].volume ?? 0;
    if (vol > prevVol && prevVol !== 0) {
      pvi += pvi * ((d.close - candles[i - 1].close) / candles[i - 1].close);
    }
    return pvi;
  });
}

export function calcNVI(candles: Candle[]): N[] {
  let nvi = 1000;
  return candles.map((d, i) => {
    if (i === 0) return nvi;
    const vol     = d.volume ?? 0;
    const prevVol = candles[i - 1].volume ?? 0;
    if (vol < prevVol && prevVol !== 0) {
      nvi += nvi * ((d.close - candles[i - 1].close) / candles[i - 1].close);
    }
    return nvi;
  });
}

export function calcEOM(candles: Candle[], period = 14): N[] {
  const em = candles.map((d, i) => {
    if (i === 0) return 0;
    const midPt = ((d.high ?? d.close) + (d.low ?? d.close)) / 2;
    const prevMidPt = ((candles[i-1].high ?? candles[i-1].close) + (candles[i-1].low ?? candles[i-1].close)) / 2;
    const boxRatio = (d.volume ?? 0) / ((d.high ?? d.close) - (d.low ?? d.close) || 1);
    return (midPt - prevMidPt) / boxRatio;
  });
  return sma(em, period);
}

export function calcPsychologicalLine(candles: Candle[], period = 12): N[] {
  return candles.map((d, i) => {
    if (i < period) return null;
    let ups = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].close > candles[j - 1].close) ups++;
    }
    return (ups / period) * 100;
  });
}

export function calcVolumeRatio(candles: Candle[], period = 20): N[] {
  return candles.map((_, i) => {
    if (i < period) return null;
    const slice = candles.slice(i - period + 1, i + 1);
    let upVol = 0, downVol = 0;
    for (let j = 1; j < slice.length; j++) {
      const v2 = slice[j].volume ?? 0;
      if (slice[j].close >= slice[j - 1].close) upVol += v2;
      else downVol += v2;
    }
    return downVol === 0 ? 100 : (upVol / downVol) * 100;
  });
}

export function calcDisparity(closes: N[], period = 20): N[] {
  const ma = sma(closes, period);
  return closes.map((c, i) => c != null && ma[i] != null && v(ma[i]) !== 0 ? ((v(c) - v(ma[i])) / v(ma[i])) * 100 : null);
}

export function calcSONAR(closes: N[], fast = 9, slow = 26, signal = 9): N[] {
  const { macd, signal: sig } = calcMACD(closes, fast, slow, signal);
  return macd.map((m, i) => m != null && sig[i] != null ? v(m) - v(sig[i]) : null);
}

export function calcTradingValue(candles: Candle[]): N[] {
  return candles.map((d) => d.volume != null && d.volume > 0 ? d.close * d.volume : null);
}

export function calcAroonOscillator(candles: Candle[], period = 25): N[] {
  const { up, down } = calcAroon(candles, period);
  return up.map((u, i) => u != null && down[i] != null ? v(u) - v(down[i]) : null);
}
