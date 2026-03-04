import { GradientCard } from "./GradientCard";
import { type TavilyOverview } from "./types";

function UsageRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>{label}</span>
      <span className="font-medium text-slate-700">{value.toLocaleString()}</span>
    </div>
  );
}

export function TavilyCard({ loading, tavily }: { loading: boolean; tavily: TavilyOverview | null }) {
  const account = tavily?.usage?.account ?? null;
  const planName = account?.current_plan ?? "—";
  const planUsed = account?.plan_usage ?? 0;
  const planLimit = account?.plan_limit ?? null;
  const paygoUsed = account?.paygo_usage ?? 0;
  const paygoLimit = account?.paygo_limit ?? null;
  const pct = planLimit != null && planLimit > 0 ? Math.min((planUsed / planLimit) * 100, 100) : 0;
  const hasPaygo = paygoLimit !== null;

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
          planName
        ) : (
          "API 키 미설정"
        )}
      </h2>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">API Usage</p>

        {/* Plan usage bar */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">Monthly plan</span>
          <span className="text-sm text-slate-600">
            {loading
              ? "..."
              : account
              ? `${planUsed.toLocaleString()} / ${planLimit != null ? planLimit.toLocaleString() : "∞"} Credits`
              : "—"}
          </span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden mb-4">
          {!loading && account && (
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-500"
              style={{ width: planLimit != null ? `${pct}%` : "100%" }}
            />
          )}
        </div>

        {/* Usage breakdown */}
        {!loading && account && (
          <div className="space-y-1 mb-4">
            <UsageRow label="Search" value={account.search_usage} />
            <UsageRow label="Crawl" value={account.crawl_usage} />
            <UsageRow label="Extract" value={account.extract_usage} />
            <UsageRow label="Map" value={account.map_usage} />
            <UsageRow label="Research" value={account.research_usage} />
          </div>
        )}

        {/* PAYG */}
        <div className="flex items-center gap-2">
          <div
            className={`w-9 h-5 rounded-full flex items-center px-0.5 ${
              hasPaygo ? "bg-teal-400 justify-end" : "bg-slate-300 justify-start"
            }`}
          >
            <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
          </div>
          <span className="text-sm text-slate-600">
            Pay as you go
            {hasPaygo && paygoUsed > 0 && (
              <span className="ml-1 text-slate-400">
                ({paygoUsed.toLocaleString()} credits used)
              </span>
            )}
          </span>
        </div>
      </div>
    </GradientCard>
  );
}
