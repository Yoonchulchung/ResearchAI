"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getLeaderboard,
  CATEGORY_LABELS,
  CATEGORY_BENCHMARK_DEFS,
  CATEGORY_TABLE_BENCHMARKS,
  CATEGORY_SCORE_LABEL,
  CATEGORY_DATA_SOURCES,
  type LeaderboardResult,
} from "@/lib/api/ai-leaderboard";
import {
  IconRefresh,
  LeaderboardTable,
  PAGE_SIZE,
  PARAM_OPTIONS,
  TYPE_OPTIONS,
  defaultSortDir,
  type SortDir,
} from "../_components/leaderboard-page-parts";

const ALL_CATEGORIES = Object.entries(CATEGORY_LABELS) as [string, string][];

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
  const [sortBy, setSortBy] = useState("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (opts: {
    refresh?: boolean;
    newPage?: number;
    newType?: string;
    newMaxParams?: string;
    newCategory?: string;
    newSortBy?: string;
    newSortDir?: SortDir;
  } = {}) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const currentPage = opts.newPage ?? page;
    const currentType = opts.newType ?? type;
    const currentMax = opts.newMaxParams ?? maxParams;
    const currentCategory = opts.newCategory ?? category;
    const currentSortBy = opts.newSortBy ?? sortBy;
    const currentSortDir = opts.newSortDir ?? sortDir;

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
        sortBy: currentSortBy,
        sortDir: currentSortDir,
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, type, maxParams, category, sortBy, sortDir]);

  useEffect(() => { load(); }, []);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const tableBenchmarks = CATEGORY_TABLE_BENCHMARKS[category] ?? [];
  const benchmarkDefs = CATEGORY_BENCHMARK_DEFS[category] ?? {};
  const isLlmLike = category === "llm" || category === "vlm" || category === "code";

  const pageBase = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";
  const selectClass = `rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${isDark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white text-slate-700"}`;
  const handleSort = useCallback((nextSortBy: string) => {
    const nextDir = sortBy === nextSortBy ? (sortDir === "asc" ? "desc" : "asc") : defaultSortDir(nextSortBy);
    setSortBy(nextSortBy);
    setSortDir(nextDir);
    setPage(0);
    load({ newPage: 0, newSortBy: nextSortBy, newSortDir: nextDir });
  }, [load, sortBy, sortDir]);

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
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
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
              onClick={() => { setCategory(id); setPage(0); setType(""); setSortBy("rank"); setSortDir("asc"); load({ newCategory: id, newPage: 0, newType: "", newSortBy: "rank", newSortDir: "asc" }); }}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
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
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${type === opt.value ? (isDark ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-300" : "border-indigo-200 bg-indigo-50 text-indigo-700") : (isDark ? "border-white/10 text-white/50 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50")}`}
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
          <div className={`mb-4 rounded-md border px-3 py-2 text-xs ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-500"}`}>
            {category === "asr" && "※ 점수는 100 - WER(단어 오류율)로 변환된 정확도입니다. 높을수록 좋습니다."}
            {category === "text-to-image" && "※ 공개 벤치마크가 없어 HuggingFace 좋아요 수 기준으로 정렬됩니다."}
          </div>
        )}

        <LeaderboardTable
          entries={data?.entries ?? []}
          loading={loading}
          error={error}
          isDark={isDark}
          panelClass={panelClass}
          sortBy={sortBy}
          sortDir={sortDir}
          scoreLabel={CATEGORY_SCORE_LABEL[category] ?? "점수"}
          tableBenchmarks={tableBenchmarks}
          benchmarkDefs={benchmarkDefs}
          onSort={handleSort}
          onModelClick={(entry) => router.push(`/news/leaderboard/${encodeURIComponent(entry.id)}`)}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className={`text-xs ${textSub}`}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} / {data?.total ?? 0}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const p = page - 1; setPage(p); load({ newPage: p }); }}
                disabled={page === 0}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                이전
              </button>
              <span className={`text-xs ${textSub}`}>{page + 1} / {totalPages}</span>
              <button
                onClick={() => { const p = page + 1; setPage(p); load({ newPage: p }); }}
                disabled={page >= totalPages - 1}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
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
