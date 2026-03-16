import { GradientCard } from "./GradientCard";

interface AnalyticsSummary {
  totalCost: number;
  totalCalls: number;
  models: string[];
}

export function TokenUsageCard({
  loading,
  analytics,
}: {
  loading: boolean;
  analytics: AnalyticsSummary | null;
}) {
  return (
    <GradientCard
      badge="TOKEN USAGE"
      gradient="linear-gradient(135deg, #f0edf8 0%, #ddd0f0 30%, #e8d8f8 60%, #f0e8f8 100%)"
      blob="radial-gradient(ellipse at 40% 70%, #c8a8e8 0%, transparent 60%), radial-gradient(ellipse at 75% 25%, #d0b8f0 0%, transparent 50%)"
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "총 비용 (30일)", value: loading || !analytics ? null : `$${analytics.totalCost.toFixed(4)}` },
          { label: "총 호출 수 (30일)", value: loading || !analytics ? null : analytics.totalCalls.toLocaleString() },
          { label: "사용 모델 수 (30일)", value: loading || !analytics ? null : String(analytics.models.length) },
        ].map((item) => (
          <div key={item.label} className="bg-white/50 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium mb-1">{item.label}</p>
            {item.value === null ? (
              <span className="inline-block w-16 h-5 bg-white/60 rounded animate-pulse" />
            ) : (
              <p className="text-base font-bold text-slate-800">{item.value}</p>
            )}
          </div>
        ))}
      </div>
    </GradientCard>
  );
}
