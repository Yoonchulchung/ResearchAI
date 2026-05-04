import { GradientCard } from "./GradientCard";

interface AnalyticsSummary {
  totalCost: number;
  totalCalls: number;
  models: string[];
  chartData: Record<string, string | number>[];
  byModel: Record<string, { cost: number; calls: number }>;
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
      gradient="linear-gradient(135deg, #1e1b3a 0%, #2a1f3d 30%, #1e2040 60%, #1a1e38 100%)"
      blob="radial-gradient(ellipse at 40% 70%, #3b1f6e 0%, transparent 60%), radial-gradient(ellipse at 75% 25%, #2d2060 0%, transparent 50%)"
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "총 비용 (30일)", value: loading || !analytics ? null : `$${analytics.totalCost.toFixed(4)}` },
          { label: "총 호출 수 (30일)", value: loading || !analytics ? null : analytics.totalCalls.toLocaleString() },
          { label: "사용 모델 수 (30일)", value: loading || !analytics ? null : String(analytics.models.length) },
        ].map((item) => (
          <div key={item.label} className="bg-white/10 rounded-xl px-4 py-3">
            <p className="text-xs text-white/50 font-medium mb-1">{item.label}</p>
            {item.value === null ? (
              <span className="inline-block w-16 h-5 bg-white/20 rounded animate-pulse" />
            ) : (
              <p className="text-base font-bold text-white">{item.value}</p>
            )}
          </div>
        ))}
      </div>
    </GradientCard>
  );
}
