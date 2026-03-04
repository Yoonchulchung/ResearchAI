import { NodeState, STATUS_CONFIG } from "./types";

export function NodeCard({
  icon,
  label,
  desc,
  state,
  onRun,
  disabled,
  extraActions,
}: {
  icon: string;
  label: string;
  desc: string;
  state: NodeState;
  onRun: () => void;
  disabled?: boolean;
  extraActions?: React.ReactNode;
}) {
  const cfg = STATUS_CONFIG[state.status];

  return (
    <div className={`bg-white rounded-2xl border-2 ${cfg.border} transition-all shadow-sm`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-base">{icon}</span>
              <span className="font-bold text-sm text-slate-800">{label}</span>
            </div>
            <span className="text-xs text-slate-400">{desc}</span>
          </div>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${cfg.badge} shrink-0`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        </div>

        {state.ms !== undefined && state.status === "ok" && (
          <div className="text-xs text-slate-400 mb-2">⏱ {(state.ms / 1000).toFixed(1)}s</div>
        )}

        {state.error && (
          <div className="text-xs text-red-500 bg-red-50 rounded-lg px-2 py-1.5 mb-2">
            {state.error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={disabled || state.status === "running"}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {state.status === "running" ? (
              <span className="animate-spin text-xs">◌</span>
            ) : (
              <span>▶</span>
            )}
            테스트
          </button>
          {extraActions}
        </div>
      </div>

      {state.result && state.expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          <pre className="text-xs text-slate-600 whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto font-mono leading-relaxed">
            {state.result}
          </pre>
        </div>
      )}
    </div>
  );
}
