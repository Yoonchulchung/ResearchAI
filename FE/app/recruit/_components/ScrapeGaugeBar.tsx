"use client";

interface ScrapeGaugeBarProps {
  running: boolean;
  label?: string;
  current?: number;
  total?: number;
  error?: string | null;
  done?: boolean;
  className?: string;
}

export function ScrapeGaugeBar({
  running,
  label,
  current,
  total,
  error = null,
  done = false,
  className = "",
}: ScrapeGaugeBarProps) {
  if (!running && !done && !error) return null;

  const pct = total && total > 0 ? Math.min(100, ((current ?? 0) / total) * 100) : null;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium truncate ${
          error ? "text-red-500" : done ? "text-emerald-600" : "text-slate-600 dark:text-slate-300"
        }`}>
          {error ?? label ?? (running ? "수집 중..." : "완료")}
        </span>
        {total != null && total > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
            {current ?? 0} / {total}건
          </span>
        )}
        {total == null && current != null && current > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
            {current.toLocaleString()}건
          </span>
        )}
      </div>

      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        {error ? (
          <div className="h-full w-full bg-red-400 rounded-full" />
        ) : done && pct == null ? (
          <div className="h-full w-full rounded-full bg-emerald-500 transition-all duration-300" />
        ) : pct != null ? (
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: done ? "#10b981" : "#34d399" }}
          />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-emerald-300 dark:bg-emerald-500 animate-pulse" />
        )}
      </div>
    </div>
  );
}
