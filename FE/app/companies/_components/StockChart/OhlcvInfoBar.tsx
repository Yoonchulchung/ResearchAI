import type { InfoBarProps } from "./types";
import { fmtPrice, fmtVol, fmtPct } from "./utils";

export function OhlcvInfoBar({ hov, prevClose, ma7Val, ma25Val, currency, isDark, subtleText, showPrevDelta }: InfoBarProps) {
  const lbl = (text: string, val: string, color?: string) => (
    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
      <span className={subtleText}>{text}</span>
      <span className={`font-mono font-bold ${color ?? (isDark ? "text-white/90" : "text-slate-800")}`}>
        {val}
      </span>
    </span>
  );

  const prevDelta = (showPrevDelta && hov && prevClose)
    ? ((hov.close - prevClose) / prevClose) * 100
    : null;

  const isUp = hov == null || hov.open == null ? true : hov.close >= hov.open;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-4 py-2 text-xs transition-all duration-300
        ${isDark ? "border-white/5 bg-slate-950/40" : "border-slate-100 bg-slate-50/50"}
        ${hov ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"}`}
      style={{ minHeight: "36px" }}
    >
      {hov ? (
        <>
          <span className={`font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20`}>{hov.date}</span>
          {hov.open  != null && hov.open  > 0 && lbl("시가", fmtPrice(hov.open,  currency))}
          {hov.high  != null && hov.high  > 0 && lbl("고가", fmtPrice(hov.high,  currency), isDark ? "text-rose-400" : "text-rose-600")}
          {hov.low   != null && hov.low   > 0 && lbl("저가", fmtPrice(hov.low,   currency), isDark ? "text-sky-400" : "text-sky-600")}
          {lbl("종가", fmtPrice(hov.close, currency), isUp ? (isDark ? "text-rose-400" : "text-rose-600") : (isDark ? "text-sky-400" : "text-sky-600"))}
          {prevDelta != null && (
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
              prevDelta >= 0
                ? isDark ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-rose-50 border-rose-100 text-rose-600"
                : isDark ? "bg-sky-500/10 border-sky-500/20 text-sky-400"  : "bg-sky-50 border-sky-100 text-sky-600"
            }`}>
              {fmtPct(prevDelta)}
            </span>
          )}
          {ma7Val  != null && lbl("MA7",  fmtPrice(ma7Val,  currency), isDark ? "text-amber-400"  : "text-amber-600")}
          {ma25Val != null && lbl("MA25", fmtPrice(ma25Val, currency), isDark ? "text-violet-400" : "text-violet-600")}
          {hov.volume != null && hov.volume > 0 && lbl("거래량", fmtVol(hov.volume))}
        </>
      ) : (
        <span className="invisible text-xs">placeholder</span>
      )}
    </div>
  );
}
