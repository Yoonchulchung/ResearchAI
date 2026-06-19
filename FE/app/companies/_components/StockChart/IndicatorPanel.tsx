"use client";
import type { ChartOverlayId, SubPanelId, IndicatorId } from "./types";

export interface IndicatorMeta {
  id: IndicatorId;
  label: string;
  desc?: string;
}

export const OVERLAY_INDICATORS: IndicatorMeta[] = [
  { id: "ma",           label: "이동평균선",     desc: "MA7 / MA25" },
  { id: "bb",           label: "볼린저밴드",      desc: "BB(20,2)" },
  { id: "ichimoku",     label: "일목균형표" },
  { id: "sar",          label: "Parabolic SAR",  desc: "step 0.02" },
  { id: "envelope",     label: "Envelope",        desc: "MA20 ± 3%" },
  { id: "priceChannel", label: "Price Channel",   desc: "Donchian 20" },
  { id: "vwap",         label: "VWAP" },
];

export const SUBPANEL_INDICATORS: IndicatorMeta[] = [
  { id: "volume",       label: "거래량" },
  { id: "tradingValue", label: "거래대금" },
  { id: "macd",         label: "MACD",            desc: "12,26,9" },
  { id: "stochFast",    label: "Stochastic Fast",  desc: "14,3" },
  { id: "stochSlow",    label: "Stochastic Slow",  desc: "14,3,3" },
  { id: "rsi",          label: "RSI",              desc: "14" },
  { id: "cci",          label: "CCI",              desc: "20" },
  { id: "momentum",     label: "모멘텀",            desc: "10" },
  { id: "disparity",    label: "이격도",            desc: "MA20" },
  { id: "volumeRatio",  label: "Volume Ratio",     desc: "20" },
  { id: "roc",          label: "ROC",              desc: "12" },
  { id: "adLine",       label: "AD Line" },
  { id: "atr",          label: "ATR",              desc: "14" },
  { id: "cmf",          label: "CMF",              desc: "20" },
  { id: "mfi",          label: "MFI",              desc: "14" },
  { id: "obv",          label: "OBV" },
  { id: "psychLine",    label: "투자심리도",         desc: "12" },
  { id: "sonar",        label: "SONAR" },
  { id: "chaikinVol",   label: "Chaikin Volatility" },
  { id: "chaikinOsc",   label: "Chaikin Oscillator" },
  { id: "trix",         label: "TRIX",             desc: "15" },
  { id: "williamsR",    label: "Williams %R",       desc: "14" },
  { id: "adx",          label: "ADX / DMI",         desc: "14" },
  { id: "aroon",        label: "Aroon",             desc: "25" },
  { id: "aroonOsc",     label: "Aroon Oscillator",  desc: "25" },
  { id: "elderBull",    label: "Elder Ray Bull",    desc: "EMA13" },
  { id: "elderBear",    label: "Elder Ray Bear",    desc: "EMA13" },
  { id: "stochRsi",     label: "Stochastic RSI",    desc: "14,14,3,3" },
  { id: "massIndex",    label: "Mass Index",        desc: "25" },
  { id: "pvi",          label: "PVI" },
  { id: "nvi",          label: "NVI" },
  { id: "eom",          label: "EOM",              desc: "14" },
  { id: "ultimateOsc",  label: "Ultimate Oscillator", desc: "7,14,28" },
  { id: "pvo",          label: "PVO",              desc: "12,26,9" },
  { id: "ppo",          label: "PPO",              desc: "12,26,9" },
  { id: "forceIndex",   label: "Force Index",       desc: "EMA13" },
];

interface IndicatorPanelProps {
  open:      boolean;
  onClose:   () => void;
  active:    Set<IndicatorId>;
  onToggle:  (id: IndicatorId) => void;
  isDark:    boolean;
}

export function IndicatorPanel({ open, onClose, active, onToggle, isDark }: IndicatorPanelProps) {
  const bg    = isDark ? "bg-slate-900 border-white/10" : "bg-white border-slate-200";
  const head  = isDark ? "border-white/10 text-white"    : "border-slate-200 text-slate-900";
  const sec   = isDark ? "text-white/40"                  : "text-slate-400";
  const row   = isDark ? "hover:bg-white/5"               : "hover:bg-slate-50";
  const lbl   = isDark ? "text-white/85"                  : "text-slate-800";
  const desc  = isDark ? "text-white/35"                  : "text-slate-400";

  const renderItem = (meta: IndicatorMeta) => {
    const isOn = active.has(meta.id);
    return (
      <button
        key={meta.id}
        type="button"
        onClick={() => onToggle(meta.id)}
        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${row}`}
      >
        <span
          className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            isOn
              ? "border-indigo-500 bg-indigo-500"
              : isDark
                ? "border-white/25 bg-transparent"
                : "border-slate-300 bg-white"
          }`}
        >
          {isOn && (
            <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-bold ${lbl}`}>{meta.label}</span>
          {meta.desc && <span className={`text-[10px] ${desc}`}>{meta.desc}</span>}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* 백드롭 */}
      {open && (
        <div
          className="absolute inset-0 z-20"
          style={{ background: "transparent" }}
          onClick={onClose}
        />
      )}
      {/* 패널 */}
      <div
        className={`absolute top-0 left-0 z-30 flex h-full flex-col border-r shadow-2xl transition-transform duration-300 ${bg} ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: 240 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className={`flex items-center justify-between border-b px-4 py-3 ${head}`}>
          <span className="text-sm font-black">보조지표</span>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md p-1 transition-colors ${isDark ? "hover:bg-white/10 text-white/60" : "hover:bg-slate-100 text-slate-500"}`}
            aria-label="닫기"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 스크롤 목록 */}
        <div className="flex-1 overflow-y-auto">
          <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${sec}`}>
            차트지표
          </div>
          {OVERLAY_INDICATORS.map(renderItem)}

          <div className={`mt-2 border-t px-4 py-2 text-[10px] font-black uppercase tracking-widest ${sec} ${isDark ? "border-white/10" : "border-slate-100"}`}>
            보조지표
          </div>
          {SUBPANEL_INDICATORS.map(renderItem)}
        </div>

        {/* 초기화 */}
        <div className={`border-t p-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
          <button
            type="button"
            onClick={() => {
              (["ma", "volume"] as IndicatorId[]).forEach((id) => {
                if (!active.has(id)) onToggle(id);
              });
              [...active].forEach((id) => {
                if (id !== "ma" && id !== "volume") onToggle(id);
              });
            }}
            className={`w-full rounded-md py-2 text-xs font-bold transition-colors ${
              isDark
                ? "bg-white/5 text-white/55 hover:bg-white/10"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            초기화
          </button>
        </div>
      </div>
    </>
  );
}
