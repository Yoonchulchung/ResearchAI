import type { CoverLetter, JobCategoryTarget } from "@/lib/api/recruit/cover-letter";
import { MODELS } from "../../_constants";
import {
  COMPANY_TYPE_FILTERS,
  SOURCE_FILTERS,
  TARGET_FILTERS,
  type TargetFilter,
} from "../_lib/spec-analysis";

type ThemeProps = {
  isDark: boolean;
  panelClass: string;
  inputClass: string;
  textMain: string;
  textSub: string;
};

export function SpecHeaderSection({
  search,
  source,
  companyType,
  target,
  model,
  loading,
  analyzing,
  selectedCount,
  itemCount,
  total,
  analyzedModel,
  analysisLog,
  analysisError,
  error,
  ...theme
}: ThemeProps & {
  search: string;
  source: string;
  companyType: string;
  target: TargetFilter;
  model: string;
  loading: boolean;
  analyzing: boolean;
  selectedCount: number;
  itemCount: number;
  total: number;
  analyzedModel: string;
  analysisLog: string;
  analysisError: string | null;
  error: string | null;
  onBack: () => void;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onCompanyTypeChange: (value: string) => void;
  onTargetChange: (value: JobCategoryTarget) => void;
  onModelChange: (value: string) => void;
  onSubmitSearch: () => void;
  onRunAnalysis: () => void;
}) {
  const {
    isDark,
    panelClass,
    inputClass,
    textMain,
    textSub,
    onBack,
    onSearchChange,
    onSourceChange,
    onCompanyTypeChange,
    onTargetChange,
    onModelChange,
    onSubmitSearch,
    onRunAnalysis,
  } = theme;

  return (
    <section className={`rounded-md border p-5 ${panelClass}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            onClick={onBack}
            className={`mb-3 inline-flex items-center text-sm font-semibold ${isDark ? "text-white/45 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
          >
            ← 채용
          </button>
          <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>스펙 분석</h1>
          <p className={`mt-2 text-sm ${textSub}`}>
            합격 자소서에서 학력, 학점, 어학, 자격증, 인턴, 활동 이력을 추출해 한눈에 비교합니다.
          </p>
        </div>

        <div className={`flex w-full overflow-hidden rounded-md border ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
          <select
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            className={`flex-1 min-w-[110px] border-0 px-3 py-2 text-xs font-semibold outline-none ${isDark ? "bg-transparent text-white" : "bg-transparent text-slate-700"}`}
            title="AI 모델 선택"
          >
            {MODELS.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <button
            onClick={onRunAnalysis}
            disabled={analyzing || loading || itemCount === 0}
            className="flex-[1.2] inline-flex items-center justify-center gap-2 bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          >
            {analyzing && <span className="h-3 w-3 rounded-full border-2 border-white/35 border-t-white animate-spin" />}
            {selectedCount > 0 ? `선택 ${selectedCount}건 분석` : "AI 스펙 분석"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitSearch();
            }}
            className="flex gap-2 lg:flex-1"
          >
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="기업명, 직무, 시즌 검색"
              className={`h-10 min-w-0 flex-1 rounded-md border px-3 text-sm outline-none transition-colors ${inputClass}`}
            />
            <button
              type="submit"
              disabled={loading}
              className={`h-10 rounded-md px-4 text-xs font-bold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
                isDark ? "bg-white/10 text-white/70 hover:bg-white/15" : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              조회
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center">
            <select
              value={source}
              onChange={(event) => onSourceChange(event.target.value)}
              className={`h-10 rounded-md border px-3 text-xs font-semibold outline-none lg:w-36 ${inputClass}`}
            >
              {SOURCE_FILTERS.map((item) => (
                <option key={item.value || "all"} value={item.value} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-800"}>{item.label}</option>
              ))}
            </select>
            <select
              value={companyType}
              onChange={(event) => onCompanyTypeChange(event.target.value)}
              className={`h-10 rounded-md border px-3 text-xs font-semibold outline-none lg:w-40 ${inputClass}`}
            >
              {COMPANY_TYPE_FILTERS.map((item) => (
                <option key={item || "all"} value={item} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-800"}>{item || "기업분류 전체"}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={`border-t pt-3 ${isDark ? "border-white/5" : "border-slate-100"}`}>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
            {TARGET_FILTERS.map((item) => (
              <button
                key={item.value}
                onClick={() => onTargetChange(item.value)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  target === item.value
                    ? "bg-indigo-600 text-white border border-indigo-600"
                    : isDark
                      ? "text-white/50 border border-transparent hover:text-white hover:bg-white/5"
                      : "text-slate-500 border border-transparent hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={`mt-4 flex flex-wrap items-center gap-2 text-xs ${textSub}`}>
        <span>조회 {itemCount.toLocaleString()}건 / 전체 {total.toLocaleString()}건</span>
        {analyzedModel && <span>· 분석 모델 {analyzedModel}</span>}
        {analysisLog && (
          <span className={`flex items-center gap-1.5 ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {analysisLog}
          </span>
        )}
        {analysisError && <span className={isDark ? "text-red-300" : "text-red-500"}>{analysisError}</span>}
        {error && <span className={isDark ? "text-red-300" : "text-red-500"}>{error}</span>}
      </div>
    </section>
  );
}

export function CoverLetterSelectionPanel({
  items,
  analyses,
  selectedIds,
  hasMore,
  loading,
  total,
  isDark,
  panelClass,
  textMain,
  textSub,
  onSelectUnanalyzed,
  onSelectN,
  onClearSelection,
  onToggleSelect,
  onLoadMore,
}: {
  items: CoverLetter[];
  analyses: Record<string, unknown>;
  selectedIds: Set<string>;
  hasMore: boolean;
  loading: boolean;
  total: number;
  isDark: boolean;
  panelClass: string;
  textMain: string;
  textSub: string;
  onSelectUnanalyzed: () => void;
  onSelectN: (count: number) => void;
  onClearSelection: () => void;
  onToggleSelect: (id: string) => void;
  onLoadMore: () => void;
}) {
  if (items.length === 0 || loading) return null;

  const unanalyzedItems = items.filter((item) => !analyses[item.id]);

  return (
    <section className={`rounded-md border p-4 ${panelClass}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className={`text-sm font-bold ${textMain}`}>자소서 선택</h2>
          <span className={`text-xs ${textSub}`}>
            미분석 {unanalyzedItems.length}건 · 분석됨 {Object.keys(analyses).length}건 (숨김)
          </span>
          {selectedIds.size > 0 && (
            <span className="rounded-sm bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600 border border-indigo-100">
              {selectedIds.size}개 선택
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={onSelectUnanalyzed}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            미분석만
          </button>
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              onClick={() => onSelectN(n)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                selectedIds.size === n
                  ? isDark ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-200" : "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {n}개
            </button>
          ))}
          {selectedIds.size > 0 && (
            <button
              onClick={onClearSelection}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            >
              해제
            </button>
          )}
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {unanalyzedItems.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => onToggleSelect(item.id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? isDark ? "border-indigo-400/40 bg-indigo-500/15" : "border-indigo-200 bg-indigo-50"
                    : isDark ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-slate-100 bg-slate-50 hover:bg-white"
                }`}
              >
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isSelected ? "border-indigo-600 bg-indigo-600" : isDark ? "border-white/30" : "border-slate-300"
                }`}>
                  {isSelected && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none" className="text-white">
                      <path d="M1 3.5L3.5 6L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-xs font-bold ${textMain}`}>{item.company}</p>
                  <p className={`truncate text-[11px] ${textSub}`}>{item.position}</p>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold ${isDark ? "bg-white/10 text-white/40" : "bg-slate-100 text-slate-400"}`}>
                  미분석
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {hasMore && (
        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs ${textSub}`}>{items.length.toLocaleString()}건 표시 중 / 전체 {total.toLocaleString()}건</span>
          <button
            onClick={onLoadMore}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" /> : null}
            더 불러오기 ({total - items.length}건 남음)
          </button>
        </div>
      )}
    </section>
  );
}
