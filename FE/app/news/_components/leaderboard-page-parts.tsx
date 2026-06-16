import {
  MODEL_TYPE_LABELS,
  type AiModelEntry,
} from "@/lib/api/ai-leaderboard";

export const PAGE_SIZE = 50;

export const TYPE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "chat", label: "Chat" },
  { value: "pretrained", label: "Pretrained" },
  { value: "fine-tuned", label: "Fine-tuned" },
  { value: "merge", label: "Merge" },
];

export const PARAM_OPTIONS = [
  { value: "", label: "전체" },
  { value: "7", label: "≤7B" },
  { value: "13", label: "≤13B" },
  { value: "35", label: "≤35B" },
  { value: "80", label: "≤80B" },
];

export type SortDir = "asc" | "desc";

export function defaultSortDir(sortBy: string): SortDir {
  return sortBy === "rank" || sortBy === "modelName" || sortBy === "modelType" ? "asc" : "desc";
}

export function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  activeDir,
  align = "left",
  className = "",
  onSort,
}: {
  label: string;
  sortKey: string;
  activeSort: string;
  activeDir: SortDir;
  align?: "left" | "right";
  className?: string;
  onSort: (sortKey: string) => void;
}) {
  const active = activeSort === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex w-full items-center gap-1.5 transition hover:text-indigo-500 ${align === "right" ? "justify-end" : "justify-start"} ${active ? "text-indigo-500" : ""}`}
      >
        <span>{label}</span>
        <span className={`text-[10px] ${active ? "opacity-100" : "opacity-30"}`}>
          {active ? (activeDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function ScoreBar({ value, max = 100, isDark }: { value: number | null; max?: number; isDark: boolean }) {
  if (value == null) return <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>—</span>;
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : isDark ? "bg-red-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-14 overflow-hidden rounded-sm ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
        <div className={`h-full rounded-sm transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${isDark ? "text-white/70" : "text-slate-600"}`}>{value.toFixed(1)}</span>
    </div>
  );
}

function TypeBadge({ type, isDark }: { type: string | null; isDark: boolean }) {
  if (!type) return null;
  const colors: Record<string, string> = {
    chat: isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-700",
    pretrained: isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700",
    "fine-tuned": isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-700",
    merge: isDark ? "bg-purple-500/15 text-purple-300" : "bg-purple-50 text-purple-700",
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${colors[type] ?? (isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-500")}`}>
      {MODEL_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function ModelRow({
  entry, isDark, onClick, tableBenchmarks,
}: {
  entry: AiModelEntry;
  isDark: boolean;
  onClick: () => void;
  tableBenchmarks: string[];
}) {
  const getBenchmarkValue = (key: string): number | null => {
    if (key in entry) return (entry as unknown as Record<string, unknown>)[key] as number | null;
    return entry.benchmarks?.[key] ?? null;
  };

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b transition-colors ${isDark ? "border-white/5 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"}`}
    >
      <td className={`py-3 pl-4 pr-2 text-sm font-bold tabular-nums ${isDark ? "text-white/40" : "text-slate-400"}`}>
        {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold leading-snug ${isDark ? "text-white" : "text-slate-900"}`}>
              {entry.modelName}
            </span>
            <TypeBadge type={entry.modelType} isDark={isDark} />
            {entry.sourceCount > 1 && (
              <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-sky-500/15 text-sky-300" : "bg-sky-50 text-sky-700"}`}>
                {entry.sourceCount} sources
              </span>
            )}
          </div>
          <span className={`text-xs ${isDark ? "text-white/35" : "text-slate-400"}`}>
            {entry.org}{entry.params ? ` · ${entry.params >= 1 ? `${entry.params.toFixed(0)}B` : `${(entry.params * 1000).toFixed(0)}M`}` : ""}
            {entry.architecture ? ` · ${entry.architecture}` : ""}
          </span>
        </div>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={`text-sm font-bold tabular-nums ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
          {entry.average?.toFixed(2) ?? "—"}
        </span>
      </td>
      {tableBenchmarks.slice(0, 4).map((key, i) => (
        <td key={key} className={`py-3 pr-4 ${i >= 2 ? "hidden xl:table-cell" : "hidden md:table-cell"}`}>
          <ScoreBar value={getBenchmarkValue(key)} isDark={isDark} />
        </td>
      ))}
    </tr>
  );
}

export function LeaderboardTable({
  entries,
  loading,
  error,
  isDark,
  panelClass,
  sortBy,
  sortDir,
  scoreLabel,
  tableBenchmarks,
  benchmarkDefs,
  onSort,
  onModelClick,
}: {
  entries: AiModelEntry[];
  loading: boolean;
  error: string | null;
  isDark: boolean;
  panelClass: string;
  sortBy: string;
  sortDir: SortDir;
  scoreLabel: string;
  tableBenchmarks: string[];
  benchmarkDefs: Record<string, string>;
  onSort: (sortKey: string) => void;
  onModelClick: (entry: AiModelEntry) => void;
}) {
  return (
    <div className={`overflow-hidden rounded-md border ${panelClass}`}>
      {error ? (
        <div className={`px-6 py-12 text-center text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b text-left text-xs font-semibold uppercase tracking-wide ${isDark ? "border-white/10 text-white/35" : "border-slate-200 text-slate-400"}`}>
                <SortHeader
                  label="#"
                  sortKey="rank"
                  activeSort={sortBy}
                  activeDir={sortDir}
                  className="w-10 py-3 pl-4 pr-2"
                  onSort={onSort}
                />
                <SortHeader
                  label="모델"
                  sortKey="modelName"
                  activeSort={sortBy}
                  activeDir={sortDir}
                  className="py-3 pr-4"
                  onSort={onSort}
                />
                <SortHeader
                  label={scoreLabel}
                  sortKey="average"
                  activeSort={sortBy}
                  activeDir={sortDir}
                  align="right"
                  className="py-3 pr-4 text-right"
                  onSort={onSort}
                />
                {tableBenchmarks.slice(0, 4).map((key, i) => (
                  <SortHeader
                    key={key}
                    label={benchmarkDefs[key] ?? key}
                    sortKey={key}
                    activeSort={sortBy}
                    activeDir={sortDir}
                    className={`py-3 pr-4 ${i >= 2 ? "hidden xl:table-cell" : "hidden md:table-cell"}`}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className={`border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className={`h-4 animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                    </td>
                  </tr>
                ))
              ) : entries.map((entry) => (
                <ModelRow
                  key={entry.id}
                  entry={entry}
                  isDark={isDark}
                  tableBenchmarks={tableBenchmarks}
                  onClick={() => onModelClick(entry)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
