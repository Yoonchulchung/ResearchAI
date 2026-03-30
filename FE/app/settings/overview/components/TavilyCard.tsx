import { GradientCard } from "./GradientCard";
import { type TavilyOverview } from "./types";

function UsageRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between text-xs text-white/50">
      <span>{label}</span>
      <span className="font-medium text-white/80">{value.toLocaleString()}</span>
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
      gradient="linear-gradient(135deg, #1e293b 0%, #0f2a2a 30%, #0f2233 60%, #1a2436 100%)"
      blob="radial-gradient(ellipse at 60% 80%, #134e4a 0%, transparent 60%), radial-gradient(ellipse at 80% 30%, #1e3a5f 0%, transparent 50%)"
    >
      <h2 className="text-4xl font-bold text-white mb-8">
        {loading ? (
          <span className="inline-block w-40 h-9 bg-white/40 rounded-xl animate-pulse" />
        ) : tavily?.configured ? (
          planName
        ) : (
          "API 키 미설정"
        )}
      </h2>

      <div>
        <p className="text-sm font-semibold text-white/80 mb-3">API Usage</p>

        {/* Plan usage bar */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Monthly plan</span>
          <span className="text-sm text-white/60">
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
      </div>
    </GradientCard>
  );
}
