export function PageHeader({ isGlass = false }: { loading: boolean; isGlass?: boolean }) {
  return (
    <div className={`hidden sm:block px-8 py-6 shrink-0 transition-all ${isGlass ? "border-b border-white/20" : "bg-white border-b border-slate-200"}`}>
      <p className={`text-xs mb-1 ${isGlass ? "text-white/40" : "text-slate-400"}`}>Pages / Overview</p>
      <h1 className={`text-2xl font-bold ${isGlass ? "text-white" : "text-slate-900"}`}>Overview</h1>
    </div>
  );
}
