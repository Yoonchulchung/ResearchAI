import { NodeState, STATUS_CONFIG } from "./types";

export function NodeCard({
  label,
  desc,
  state,
  onRun,
  disabled,
  extraActions,
}: {
  label: string;
  desc: string;
  state: NodeState;
  onRun: () => void;
  disabled?: boolean;
  extraActions?: React.ReactNode;
}) {
  const cfg = STATUS_CONFIG[state.status];

  return (
    <div className={`bg-white rounded-lg border flex flex-col transition-all shadow-sm ${cfg.border} ${disabled ? "opacity-60" : ""}`}>
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h4 className="font-semibold text-sm text-slate-900 mb-1">{label}</h4>
            <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${cfg.badge} shrink-0`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        </div>

        {state.ms !== undefined && state.status === "ok" && (
          <div className="text-xs text-slate-400 font-mono mb-3">{(state.ms / 1000).toFixed(2)}s elapsed</div>
        )}

        {state.error && (
          <div className="text-xs text-red-700 bg-red-50 rounded px-3 py-2 border border-red-200 mt-2 mb-3">
            {state.error}
          </div>
        )}

        <div className="flex items-center gap-3 mt-auto pt-4">
          <button
            onClick={onRun}
            disabled={disabled || state.status === "running"}
            className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state.status === "running" ? (
              <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
            ) : (
              <span>Run Test</span>
            )}
          </button>
          {extraActions}
        </div>
      </div>

      {state.result && state.expanded && (
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 rounded-b-lg">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap wrap-break-word max-h-64 overflow-y-auto font-mono leading-relaxed">
            {state.result}
          </pre>
        </div>
      )}
    </div>
  );
}
