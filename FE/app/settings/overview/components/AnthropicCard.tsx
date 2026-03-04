import { GradientCard } from "./GradientCard";
import { type AnthropicUsage, fmtTokens } from "./types";

export function AnthropicCard({
  loading,
  anthropic,
}: {
  loading: boolean;
  anthropic: AnthropicUsage | null;
}) {
  const totals = anthropic?.data?.totals;
  const totalTokens = totals
    ? totals.input_tokens + totals.output_tokens + totals.cache_read_input_tokens + totals.cache_creation_input_tokens
    : 0;
  const monthLabel = new Date().toLocaleString("ko-KR", { month: "long" });

  return (
    <GradientCard
      badge="ANTHROPIC · TOKEN USAGE"
      gradient="linear-gradient(135deg, #f0edf8 0%, #ddd0f0 30%, #e8d8f8 60%, #f0e8f8 100%)"
      blob="radial-gradient(ellipse at 40% 70%, #c8a8e8 0%, transparent 60%), radial-gradient(ellipse at 75% 25%, #d0b8f0 0%, transparent 50%)"
    >
      <h2 className="text-4xl font-bold text-slate-900 mb-2">
        {loading ? (
          <span className="inline-block w-32 h-9 bg-white/40 rounded-xl animate-pulse" />
        ) : anthropic?.configured && totals ? (
          fmtTokens(totalTokens)
        ) : anthropic?.configured === false ? (
          "Admin Key 미설정"
        ) : anthropic?.error ? (
          "조회 실패"
        ) : (
          "—"
        )}
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        {!loading && anthropic?.configured && totals ? `${monthLabel} 총 토큰` : ""}
      </p>

      {!loading && anthropic?.configured && totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Input", value: totals.input_tokens, color: "bg-violet-400" },
            { label: "Output", value: totals.output_tokens, color: "bg-indigo-400" },
            { label: "Cache Read", value: totals.cache_read_input_tokens, color: "bg-purple-300" },
            { label: "Cache Write", value: totals.cache_creation_input_tokens, color: "bg-fuchsia-300" },
          ].map((item) => (
            <div key={item.label} className="bg-white/50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-[11px] text-slate-500 font-medium">{item.label}</span>
              </div>
              <p className="text-base font-bold text-slate-800">{fmtTokens(item.value)}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && !anthropic?.configured && (
        <p className="text-sm text-slate-400">
          <code className="bg-white/60 px-1.5 py-0.5 rounded text-xs">ANTHROPIC_ADMIN_API_KEY</code>{" "}
          환경변수를 설정하면 이달 토큰 사용량을 확인할 수 있습니다.
        </p>
      )}

      {!loading && anthropic?.configured && anthropic?.error && (
        <p className="text-sm text-red-400">{anthropic.error}</p>
      )}
    </GradientCard>
  );
}
