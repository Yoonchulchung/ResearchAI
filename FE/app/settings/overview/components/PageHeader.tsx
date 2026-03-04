export function PageHeader({ loading }: { loading: boolean }) {
  return (
    <div className="px-8 py-6 bg-white border-b border-slate-200">
      <p className="text-xs text-slate-400 mb-1">Pages / Overview</p>
      <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
    </div>
  );
}
