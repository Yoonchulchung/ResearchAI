export function SessionSkeleton() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      <div className="px-8 py-2.5 pb-3.5 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-6 bg-slate-200 rounded-lg flex-1 max-w-xs" />
          <div className="h-6 w-28 bg-slate-100 rounded-full shrink-0" />
          <div className="h-8 w-20 bg-slate-200 rounded-xl shrink-0" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-sm px-5 py-4 flex items-center gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-100 rounded w-1/4" />
              </div>
              <div className="h-6 w-12 bg-slate-100 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
