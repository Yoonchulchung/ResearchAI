"use client";
import { useState, useMemo } from "react";
import type { IndicatorId, ChartOverlays, SubPanelData, Candle } from "./types";
import {
  STRATEGY_PRESETS,
  computeSignals,
  computeConclusion,
  computePresetConclusion,
  type IndicatorSignal,
  type SignalDir,
} from "./strategy-signals";
import { analyzeChart } from "@/lib/api/ai";

const DIR_COLOR = {
  bull:    { text: "text-red-500",   border: "border-red-500/30",   icon: "▲" },
  bear:    { text: "text-blue-500",  border: "border-blue-500/30",  icon: "▼" },
  neutral: { text: "text-slate-400", border: "border-slate-300/30", icon: "●" },
} as const;

const CAT_TEXT: Record<string, string> = {
  trend:      "text-indigo-400",
  reversal:   "text-amber-400",
  momentum:   "text-violet-400",
  volatility: "text-sky-400",
  ichimoku:   "text-teal-400",
  volume:     "text-cyan-400",
  psychology: "text-orange-400",
};

const CAT_LABEL: Record<string, string> = {
  trend: "추세", reversal: "반전", momentum: "모멘텀", volatility: "변동성",
  ichimoku: "이치모쿠", volume: "거래량", psychology: "심리",
};

const CHART_AI_MODELS = [
  { id: "claude-haiku-4-5",   name: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-6",  name: "Claude Sonnet 4.6" },
  { id: "gpt-4o-mini",        name: "GPT-4o mini" },
  { id: "gpt-4o",             name: "GPT-4o" },
  { id: "gemini-2.0-flash",   name: "Gemini 2.0 Flash" },
];

interface TradingStrategyPanelProps {
  open:             boolean;
  onClose:          () => void;
  activeIndicators: Set<IndicatorId>;
  onSetIndicators:  (ids: IndicatorId[]) => void;
  chart:            Candle[];
  ma7:              (number | null)[];
  ma25:             (number | null)[];
  overlays:         ChartOverlays;
  subPanels:        SubPanelData[];
  symbol:           string;
  companyName?:     string;
  interval:         string;
  currentPrice:     number;
  changePercent:    number;
  isDark:           boolean;
}

export function TradingStrategyPanel({
  open, onClose, activeIndicators, onSetIndicators,
  chart, ma7, ma25, overlays, subPanels,
  symbol, companyName, interval, currentPrice, changePercent, isDark,
}: TradingStrategyPanelProps) {
  const [activePreset,   setActivePreset]   = useState<string | null>(null);
  const [selectedModel,  setSelectedModel]  = useState("claude-haiku-4-5");
  const [aiAnalysis,     setAiAnalysis]     = useState<string>("");
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiError,        setAiError]        = useState("");

  const signals = useMemo(
    () => computeSignals(chart, activeIndicators, overlays, subPanels, ma7, ma25),
    [chart, activeIndicators, overlays, subPanels, ma7, ma25],
  );
  const conclusion = useMemo(() => computeConclusion(signals), [signals]);

  const presetConclusion = useMemo(() =>
    Object.fromEntries(
      STRATEGY_PRESETS.map((preset) => [
        preset.id,
        computePresetConclusion(chart, ma7, ma25, preset.indicators),
      ]),
    ) as Record<string, ReturnType<typeof computeConclusion> | null>,
    [chart, ma7, ma25],
  );

  const applyPreset = (presetId: string) => {
    if (activePreset === presetId) {
      setActivePreset(null);
      onSetIndicators(["ma", "volume"]);
      setAiAnalysis("");
      setAiError("");
      return;
    }
    const preset = STRATEGY_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    onSetIndicators(preset.indicators);
    setAiAnalysis("");
    setAiError("");
  };

  const requestAiAnalysis = async () => {
    setAiLoading(true);
    setAiError("");
    setAiAnalysis("");
    const preset = STRATEGY_PRESETS.find((p) => p.id === activePreset);
    try {
      const { analysis } = await analyzeChart({
        symbol,
        companyName,
        interval,
        currentPrice,
        changePercent,
        recentCandles: chart.slice(-30).map((c) => ({
          date: c.date,
          open:  c.open  ?? c.close,
          high:  c.high  ?? c.close,
          low:   c.low   ?? c.close,
          close: c.close,
          volume: c.volume ?? undefined,
        })),
        signals: signals.map((s) => ({
          label: s.label,
          direction: s.dir,
          description: s.description,
        })),
        activeStrategy: preset?.name,
        model: selectedModel,
      });
      setAiAnalysis(analysis);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI 분석 요청 실패");
    } finally {
      setAiLoading(false);
    }
  };

  const bg    = isDark ? "bg-slate-900 border-white/10"  : "bg-white border-slate-200";
  const head  = isDark ? "border-white/10 text-white"     : "border-slate-200 text-slate-900";
  const sec   = isDark ? "text-white/40"                   : "text-slate-400";
  const card  = isDark ? "border-white/10 hover:border-white/20" : "border-slate-200 hover:border-slate-300";
  const sep   = isDark ? "border-white/10" : "border-slate-100";
  const lbl   = isDark ? "text-white/80"  : "text-slate-700";

  const renderDirBadge = (dir: SignalDir) => {
    const c = DIR_COLOR[dir];
    return (
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-bold border ${c.border} ${c.text}`}>
        {c.icon} {dir === "bull" ? "매수" : dir === "bear" ? "매도" : "중립"}
      </span>
    );
  };

  const renderSignalRow = (s: IndicatorSignal) => {
    const c = DIR_COLOR[s.dir];
    return (
      <div key={s.id} className={`rounded-md border px-3 py-2 ${c.border}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-bold ${lbl}`}>{s.label}</span>
          {renderDirBadge(s.dir)}
        </div>
        <p className={`mt-0.5 text-2xs leading-4 ${c.text}`}>{s.description}</p>
      </div>
    );
  };

  return (
    <>
      {open && <div className="absolute inset-0 z-20" onClick={onClose} />}
      <div
        className={`absolute top-0 left-0 z-30 flex h-full flex-col border-r transition-transform duration-300 ${bg} ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className={`flex items-center justify-between border-b px-4 py-3 ${head}`}>
          <div className="flex items-center gap-2.5">
            <div>
              <span className="text-sm font-black">매매 전략</span>
              <p className={`text-2xs ${sec}`}>지표 신호 + AI 해석</p>
            </div>
            {signals.length > 0 && (() => {
              const c = DIR_COLOR[conclusion.dir];
              const label = conclusion.dir === "bull" ? "매수" : conclusion.dir === "bear" ? "매도" : "중립";
              return (
                <span className={`rounded border px-2 py-0.5 text-xs font-black ${c.text} ${c.border}`}>
                  {c.icon} {label}
                </span>
              );
            })()}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md p-1 transition-colors ${isDark ? "hover:bg-white/10 text-white/60" : "hover:bg-slate-100 text-slate-500"}`}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── 전략 패키지 ── */}
          <div className={`px-4 pb-1 pt-3 text-2xs font-black uppercase tracking-widest ${sec}`}>전략 패키지</div>
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            {STRATEGY_PRESETS.map((preset) => {
              const isActive = activePreset === preset.id;
              const pc = presetConclusion[preset.id];
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-all ${
                    isActive
                      ? isDark
                        ? "border-indigo-500/50 text-indigo-300"
                        : "border-indigo-400 text-indigo-700"
                      : card
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-micro font-black uppercase tracking-wide ${
                      isActive
                        ? isDark ? "text-indigo-400" : "text-indigo-500"
                        : CAT_TEXT[preset.category] ?? sec
                    }`}>
                      {CAT_LABEL[preset.category]}
                    </span>
                    {pc && (
                      <span className={`text-micro font-black ${DIR_COLOR[pc.dir].text}`}>
                        {DIR_COLOR[pc.dir].icon}{" "}
                        {pc.dir === "bull" ? "매수" : pc.dir === "bear" ? "매도" : "중립"}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-bold ${isActive ? "" : lbl}`}>{preset.name}</span>
                  <span className={`text-2xs leading-4 ${sec}`}>{preset.desc}</span>
                </button>
              );
            })}
          </div>

          {/* ── 신호 분석 ── */}
          <div className={`border-t px-4 pb-1 pt-3 text-2xs font-black uppercase tracking-widest ${sec} ${sep}`}>
            지표 신호 분석
          </div>

          {signals.length === 0 ? (
            <p className={`px-4 py-4 text-center text-xs ${sec}`}>
              전략을 선택하거나 보조지표에서<br />지표를 활성화하면 표시됩니다.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 px-3 pb-3">
              {signals.map(renderSignalRow)}
            </div>
          )}

          {/* ── 종합 의견 ── */}
          {signals.length > 0 && (() => {
            const c = DIR_COLOR[conclusion.dir];
            return (
              <div className={`mx-3 mb-3 rounded-md border px-3 py-2.5 ${c.border}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`text-xl font-black ${c.text}`}>{c.icon}</span>
                  <div>
                    <p className={`text-xs font-black ${c.text}`}>{conclusion.label}</p>
                    <p className={`text-2xs ${sec}`}>
                      매수 {conclusion.bullCount} · 중립 {conclusion.neutralCount} · 매도 {conclusion.bearCount}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── AI 분석 ── */}
          <div className={`border-t px-4 pb-1 pt-3 text-2xs font-black uppercase tracking-widest ${sec} ${sep}`}>
            AI 차트 해석
          </div>
          <div className="px-3 pb-4">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className={`mb-2 w-full rounded-md border px-2 py-1.5 text-xs font-medium outline-none transition-colors ${
                isDark
                  ? "border-white/10 bg-slate-800 text-white/70 focus:border-white/25"
                  : "border-slate-200 bg-white text-slate-700 focus:border-slate-400"
              }`}
            >
              {CHART_AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={requestAiAnalysis}
              disabled={aiLoading || chart.length < 10}
              className={`w-full rounded-lg border py-2.5 text-xs font-black transition-colors ${
                aiLoading
                  ? "cursor-wait opacity-60 border-indigo-500/30 text-indigo-400"
                  : chart.length < 10
                    ? `cursor-not-allowed opacity-40 ${isDark ? "border-white/10 text-white/30" : "border-slate-200 text-slate-300"}`
                    : isDark
                      ? "border-indigo-500/40 text-indigo-300 hover:border-indigo-400/60 hover:text-indigo-200"
                      : "border-indigo-400 text-indigo-600 hover:border-indigo-500 hover:text-indigo-700"
              }`}
            >
              {aiLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300/30 border-t-indigo-400" />
                  AI 분석 중...
                </span>
              ) : "AI 차트 분석 요청"}
            </button>

            {aiError && (
              <p className={`mt-2 rounded-md border px-3 py-2 text-2xs ${isDark ? "border-rose-500/30 text-rose-400" : "border-rose-300 text-rose-600"}`}>
                {aiError}
              </p>
            )}

            {aiAnalysis && (
              <div className={`mt-3 rounded-md border p-3 text-[11px] leading-5 ${
                isDark ? "border-white/10 text-white/75" : "border-slate-200 text-slate-700"
              }`}>
                <p className={`mb-1.5 text-micro font-black uppercase tracking-wider ${sec}`}>
                  AI 기술적 분석 · {CHART_AI_MODELS.find((m) => m.id === selectedModel)?.name ?? selectedModel}
                </p>
                <div style={{ whiteSpace: "pre-wrap" }}>{aiAnalysis}</div>
              </div>
            )}

            <p className={`mt-2 text-micro leading-4 ${sec}`}>
              ※ AI 분석은 참고용입니다. 투자 결정은 본인의 판단에 따르십시오.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
