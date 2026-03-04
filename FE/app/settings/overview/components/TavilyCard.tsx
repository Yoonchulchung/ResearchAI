import { GradientCard } from "./GradientCard";
import { type TavilyOverview } from "./types";

export function TavilyCard({ loading, tavily }: { loading: boolean; tavily: TavilyOverview | null }) {
  const used = tavily?.usage?.used ?? 0;
  const limit = tavily?.usage?.limit ?? 1000;
  const planId = tavily?.usage?.plan_id ?? "—";
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <GradientCard
      badge="TAVILY · CURRENT PLAN"
      gradient="linear-gradient(135deg, #e8edf2 0%, #c8dfd8 30%, #d4e8f0 60%, #e0e8f0 100%)"
      blob="radial-gradient(ellipse at 60% 80%, #a8d5c8 0%, transparent 60%), radial-gradient(ellipse at 80% 30%, #b8d0e8 0%, transparent 50%)"
    >
      <h2 className="text-4xl font-bold text-slate-900 mb-8">
        {loading ? (
          <span className="inline-block w-40 h-9 bg-white/40 rounded-xl animate-pulse" />
        ) : tavily?.configured ? (
          planId
        ) : (
          "API 키 미설정"
        )}
      </h2>
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">API Usage</p>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">Monthly plan</span>
          <span className="text-sm text-slate-600">
            {loading ? "..." : tavily?.usage ? `${used.toLocaleString()} / ${limit.toLocaleString()} Credits` : "—"}
          </span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden mb-5">
          {!loading && tavily?.usage && (
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-9 h-5 bg-slate-300 rounded-full flex items-center px-0.5 cursor-not-allowed">
            <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
          </div>
          <span className="text-sm text-slate-600">Pay as you go</span>
        </div>
      </div>
    </GradientCard>
  );
}
