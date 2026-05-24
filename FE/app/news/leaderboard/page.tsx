"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getLeaderboard,
  MODEL_TYPE_LABELS,
  CATEGORY_LABELS,
  CATEGORY_BENCHMARK_DEFS,
  CATEGORY_TABLE_BENCHMARKS,
  CATEGORY_SCORE_LABEL,
  CATEGORY_DATA_SOURCES,
  type AiModelEntry,
  type LeaderboardResult,
} from "@/lib/api/ai-leaderboard";

const PAGE_SIZE = 50;
const ALL_CATEGORIES = Object.entries(CATEGORY_LABELS) as [string, string][];
const TYPE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "chat", label: "Chat" },
  { value: "pretrained", label: "Pretrained" },
  { value: "fine-tuned", label: "Fine-tuned" },
  { value: "merge", label: "Merge" },
];
const PARAM_OPTIONS = [
  { value: "", label: "전체" },
  { value: "7", label: "≤7B" },
  { value: "13", label: "≤13B" },
  { value: "35", label: "≤35B" },
  { value: "80", label: "≤80B" },
];

function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScoreBar({ value, max = 100, isDark }: { value: number | null; max?: number; isDark: boolean }) {
  if (value == null) return <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>—</span>;
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : isDark ? "bg-red-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-14 overflow-hidden rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
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
  entry, isDark, onClick, tableBenchmarks, benchmarkDefs,
}: {
  entry: AiModelEntry;
  isDark: boolean;
  onClick: () => void;
  tableBenchmarks: string[];
  benchmarkDefs: Record<string, string>;
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

export default function LeaderboardPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [category, setCategory] = useState("llm");
  const [data, setData] = useState<LeaderboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [maxParams, setMaxParams] = useState("");
  const [page, setPage] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (opts: {
    refresh?: boolean;
    newPage?: number;
    newType?: string;
    newMaxParams?: string;
    newCategory?: string;
  } = {}) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const currentPage = opts.newPage ?? page;
    const currentType = opts.newType ?? type;
    const currentMax = opts.newMaxParams ?? maxParams;
    const currentCategory = opts.newCategory ?? category;

    setError(null);
    if (opts.refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await getLeaderboard({
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
        category: currentCategory,
        type: currentType || undefined,
        maxParams: currentMax ? parseFloat(currentMax) : undefined,
        refresh: opts.refresh,
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, type, maxParams, category]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const tableBenchmarks = CATEGORY_TABLE_BENCHMARKS[category] ?? [];
  const benchmarkDefs = CATEGORY_BENCHMARK_DEFS[category] ?? {};
  const isLlmLike = category === "llm" || category === "vlm" || category === "code";

  const pageBase = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";
  const selectClass = `rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${isDark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white text-slate-700"}`;

  return (
    <main className={`h-full overflow-y-auto ${pageBase}`}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={() => router.push("/news")} className={`text-sm font-semibold ${isDark ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}>
                뉴스
              </button>
              <span className={textSub}>/</span>
              <h1 className={`text-sm font-semibold ${textMain}`}>AI 모델 리더보드</h1>
            </div>
            <p className={`mt-1 text-xs ${textSub}`}>
              {data ? `${data.total.toLocaleString()}개 모델` : ""}
              {data?.fetchedAt ? ` · ${new Date(data.fetchedAt).toLocaleDateString("ko-KR")} 기준` : ""}
            </p>
          </div>
          <div className="flex items-start gap-2">
            {/* Data source badges */}
            <div className="hidden flex-col items-end gap-1 sm:flex">
              {(CATEGORY_DATA_SOURCES[category] ?? []).map((src) => (
                <a
                  key={src.url}
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  title={src.note}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs font-medium transition ${isDark ? "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70" : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"}`}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0">
                    <path d="M1.5 6a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0ZM6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {src.name}
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" className="shrink-0 opacity-50">
                    <path d="M1.5 8.5L8.5 1.5M8.5 1.5H4.5M8.5 1.5V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ))}
            </div>
            <button
              onClick={() => load({ refresh: true })}
              disabled={refreshing}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              <IconRefresh spinning={refreshing} />
              새로고침
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setCategory(id); setPage(0); setType(""); load({ newCategory: id, newPage: 0, newType: "" }); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                category === id
                  ? isDark ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-300" : "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : isDark ? "border-white/10 text-white/50 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Mobile source — shown below category tabs on small screens */}
        <div className={`mb-3 flex flex-wrap gap-1.5 sm:hidden`}>
          {(CATEGORY_DATA_SOURCES[category] ?? []).map((src) => (
            <a
              key={src.url}
              href={src.url}
              target="_blank"
              rel="noreferrer"
              title={src.note}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs font-medium ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-400"}`}
            >
              출처: {src.name}
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" className="shrink-0 opacity-50">
                <path d="M1.5 8.5L8.5 1.5M8.5 1.5H4.5M8.5 1.5V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ))}
        </div>

        {/* Filters — only for LLM-like categories */}
        {isLlmLike && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium ${textSub}`}>타입</span>
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setType(opt.value); setPage(0); load({ newType: opt.value, newPage: 0 }); }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${type === opt.value ? (isDark ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-300" : "border-indigo-200 bg-indigo-50 text-indigo-700") : (isDark ? "border-white/10 text-white/50 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50")}`}
              >
                {opt.label}
              </button>
            ))}
            <span className={`ml-3 text-xs font-medium ${textSub}`}>파라미터</span>
            <select
              value={maxParams}
              onChange={(e) => { setMaxParams(e.target.value); setPage(0); load({ newMaxParams: e.target.value, newPage: 0 }); }}
              className={selectClass}
            >
              {PARAM_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        )}

        {/* Score label note for ASR / image */}
        {!isLlmLike && (
          <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-500"}`}>
            {category === "asr" && "※ 점수는 100 - WER(단어 오류율)로 변환된 정확도입니다. 높을수록 좋습니다."}
            {category === "text-to-image" && "※ 공개 벤치마크가 없어 HuggingFace 좋아요 수 기준으로 정렬됩니다."}
          </div>
        )}

        {/* Table */}
        <div className={`overflow-hidden rounded-2xl border ${panelClass}`}>
          {error ? (
            <div className={`px-6 py-12 text-center text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b text-left text-xs font-semibold uppercase tracking-wide ${isDark ? "border-white/10 text-white/35" : "border-slate-200 text-slate-400"}`}>
                    <th className="w-10 py-3 pl-4 pr-2">#</th>
                    <th className="py-3 pr-4">모델</th>
                    <th className="py-3 pr-4 text-right">{CATEGORY_SCORE_LABEL[category] ?? "점수"}</th>
                    {tableBenchmarks.slice(0, 4).map((key, i) => (
                      <th key={key} className={`py-3 pr-4 ${i >= 2 ? "hidden xl:table-cell" : "hidden md:table-cell"}`}>
                        {benchmarkDefs[key] ?? key}
                      </th>
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
                  ) : (data?.entries ?? []).map((entry) => (
                    <ModelRow
                      key={entry.id}
                      entry={entry}
                      isDark={isDark}
                      tableBenchmarks={tableBenchmarks}
                      benchmarkDefs={benchmarkDefs}
                      onClick={() => router.push(`/news/leaderboard/${encodeURIComponent(entry.id)}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className={`text-xs ${textSub}`}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} / {data?.total ?? 0}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const p = page - 1; setPage(p); load({ newPage: p }); }}
                disabled={page === 0}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                이전
              </button>
              <span className={`text-xs ${textSub}`}>{page + 1} / {totalPages}</span>
              <button
                onClick={() => { const p = page + 1; setPage(p); load({ newPage: p }); }}
                disabled={page >= totalPages - 1}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
