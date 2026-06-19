export function StockChartSkeleton({ isDark, panelClass, subtleText }: { isDark: boolean; panelClass: string; subtleText: string }) {
  const shimmerBg = isDark ? "bg-slate-800" : "bg-slate-200/80";

  return (
    <div className={`animate-pulse rounded-md border ${panelClass} overflow-hidden`}>
      {/* 헤더 스켈레톤 */}
      <div className={`border-b px-4 py-3 space-y-2.5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <div className="flex items-center gap-2">
          <div className={`h-5 w-16 rounded-full ${shimmerBg}`} />
          <div className={`h-3 w-24 rounded ${shimmerBg}`} />
        </div>
        <div className="flex items-baseline gap-2">
          <div className={`h-8 w-32 rounded ${shimmerBg}`} />
          <div className={`h-4 w-20 rounded ${shimmerBg}`} />
        </div>
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2.5 border-t ${isDark ? "border-white/5" : "border-slate-100"}`}>
          <div className="space-y-1"><div className="h-2.5 w-8 rounded bg-slate-400/20" /><div className={`h-4.5 w-16 rounded ${shimmerBg}`} /></div>
          <div className="space-y-1"><div className="h-2.5 w-12 rounded bg-slate-400/20" /><div className={`h-4.5 w-16 rounded ${shimmerBg}`} /></div>
          <div className="space-y-1"><div className="h-2.5 w-12 rounded bg-slate-400/20" /><div className={`h-4.5 w-16 rounded ${shimmerBg}`} /></div>
          <div className="space-y-1"><div className="h-2.5 w-16 rounded bg-slate-400/20" /><div className={`h-4.5 w-24 rounded ${shimmerBg}`} /></div>
        </div>
      </div>

      {/* 툴바 스켈레톤 */}
      <div className={`flex items-center gap-2 border-b px-3 py-1 ${isDark ? "border-white/10" : "border-slate-100"}`}>
        <div className="flex gap-1">
          <div className={`h-6 w-10 rounded ${shimmerBg}`} />
          <div className={`h-6 w-10 rounded ${shimmerBg}`} />
          <div className={`h-6 w-10 rounded ${shimmerBg}`} />
          <div className={`h-6 w-10 rounded ${shimmerBg}`} />
        </div>
        <div className={`h-4 w-px ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
        <div className="flex gap-1">
          <div className={`h-6 w-12 rounded ${shimmerBg}`} />
          <div className={`h-6 w-12 rounded ${shimmerBg}`} />
        </div>
      </div>

      {/* 인포바 공백 */}
      <div className={`h-[36px] border-b ${isDark ? "border-white/5 bg-slate-950/20" : "border-slate-100 bg-slate-50/30"}`} />

      {/* 차트 본체 */}
      <div className="relative p-6 flex flex-col justify-between h-107.5">
        {/* 격자 무늬 모사 */}
        <div className="space-y-10 w-full opacity-20">
          <div className={`h-px w-full ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
          <div className={`h-px w-full ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
          <div className={`h-px w-full ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
          <div className={`h-px w-full ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
        </div>
        {/* 볼륨 그래프 모사 */}
        <div className="flex items-end gap-1 h-14 w-full px-2 opacity-25">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-sm ${shimmerBg}`}
              style={{ height: `${15 + Math.sin(i * 0.4) * 35 + Math.cos(i) * 15}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
