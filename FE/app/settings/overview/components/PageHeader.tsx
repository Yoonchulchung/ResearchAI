export function PageHeader({
  loading,
  operational,
}: {
  loading: boolean;
  operational: boolean;
}) {
  return (
    <div className="px-8 py-6 bg-white border-b border-slate-200 flex items-start justify-between">
      <div>
        <p className="text-xs text-slate-400 mb-1">Pages / Overview</p>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
          <span className={`w-2 h-2 rounded-full shrink-0 ${operational ? "bg-green-500" : "bg-slate-300"}`} />
          <span className="text-sm text-slate-700">
            {loading ? "확인 중..." : operational ? "Operational" : "미설정"}
          </span>
        </div>
      </div>
    </div>
  );
}
