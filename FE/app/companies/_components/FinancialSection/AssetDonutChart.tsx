"use client";

import type { YearlyFinancial } from "@/lib/api/company-analysis";
import { fmtEok, fmtPct } from "./financial-utils";

interface DonutProps {
  latest:     YearlyFinancial;
  isDark:     boolean;
  panelClass: string;
  subtleText: string;
}

export function AssetDonutChart({ latest, isDark, panelClass, subtleText }: DonutProps) {
  const assets = latest.totalAssets;
  const equity = latest.totalEquity;
  const liab   = latest.totalLiabilities;

  if (!assets || (!equity && !liab)) return null;

  const equityRatio   = equity && assets ? (equity / assets) * 100 : 0;
  const liabRatio     = 100 - equityRatio;
  const R             = 70;
  const cx            = 90;
  const cy            = 90;
  const circumference = 2 * Math.PI * R;
  const equityDash    = (equityRatio / 100) * circumference;

  return (
    <div className={`rounded-md border p-4 ${panelClass}`}>
      <h3 className="mb-3 text-sm font-bold">자산비율</h3>
      <div className="flex flex-wrap items-center gap-6 sm:flex-nowrap">
        <svg width={180} height={180} viewBox="0 0 180 180" className="shrink-0">
          <circle cx={cx} cy={cy} r={R} fill="none"
            stroke={isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9"} strokeWidth={22} />
          <circle cx={cx} cy={cy} r={R} fill="none"
            stroke={isDark ? "#3b82f6" : "#60a5fa"} strokeWidth={22}
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cy})`} />
          <circle cx={cx} cy={cy} r={R} fill="none"
            stroke={isDark ? "#ef4444" : "#f87171"} strokeWidth={22}
            strokeDasharray={`${equityDash.toFixed(1)} ${circumference}`} strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cy})`} />
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize={10}
            fill={isDark ? "rgba(255,255,255,0.45)" : "#94a3b8"} fontFamily="sans-serif">
            자산총계
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={13} fontWeight="bold"
            fill={isDark ? "white" : "#1e293b"} fontFamily="monospace">
            {fmtEok(assets)}
          </text>
          {latest.year && (
            <text x={cx} y={cy + 26} textAnchor="middle" fontSize={9}
              fill={isDark ? "rgba(255,255,255,0.3)" : "#94a3b8"} fontFamily="sans-serif">
              {latest.year}년
            </text>
          )}
        </svg>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: isDark ? "#ef4444" : "#f87171" }} />
            <div>
              <p className="text-sm font-semibold">자본비중</p>
              <p className={`text-xs ${subtleText}`}>{fmtEok(equity)}</p>
            </div>
            <span className="ml-auto pl-4 font-mono text-sm font-bold">{equityRatio.toFixed(2)}%</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: isDark ? "#3b82f6" : "#60a5fa" }} />
            <div>
              <p className="text-sm font-semibold">부채비중</p>
              <p className={`text-xs ${subtleText}`}>{fmtEok(liab)}</p>
            </div>
            <span className="ml-auto pl-4 font-mono text-sm font-bold">{liabRatio.toFixed(2)}%</span>
          </div>
          {latest.debtRatio != null && (
            <div className={`rounded border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"}`}>
              <span className={subtleText}>부채비율</span>{" "}
              <span className="font-mono font-bold">{fmtPct(latest.debtRatio)}</span>
            </div>
          )}
          {latest.currentRatio != null && (
            <div className={`rounded border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"}`}>
              <span className={subtleText}>유동비율</span>{" "}
              <span className="font-mono font-bold">{fmtPct(latest.currentRatio)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
