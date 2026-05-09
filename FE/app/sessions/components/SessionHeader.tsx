import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { ModelDefinition } from "@/types";

interface Props {
  topic: string;
  model: string;
  isRunning: boolean;
  allDone: boolean;
  hasDoneTasks: boolean;
  showDetail: boolean;
  models?: ModelDefinition[];
  cloudAiModels?: ModelDefinition[];
  filterModels?: ModelDefinition[];
  webEngines?: { id: string; name: string; builtin: boolean }[];
  selectedCloudAiModel?: string;
  selectedWebModel?: string;
  selectedFilterModel?: string;
  onCloudAiModelChange?: (id: string) => void;
  onWebModelChange?: (id: string) => void;
  onFilterModelChange?: (id: string) => void;
  reEvalProgress?: { done: number; total: number } | null;
  avgConfidence?: number | null;
  totalInputTokens?: number | null;
  totalOutputTokens?: number | null;
  totalFees?: number | null;
  hideMetrics?: boolean;
  hideHeader?: boolean;
  onRunAll: (cloudAiModel?: string, webModel?: string, filterModel?: string) => void;
  onCancel: () => void;
  onExport: () => void;
  onToggleDetail: () => void;
  onReEvaluateAll?: (model: string) => void;
}


function RunningSpinner() {
  return (
    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
  );
}

export function SessionHeader({
  topic,
  model,
  isRunning,
  allDone,
  hasDoneTasks,
  showDetail,
  models,
  cloudAiModels,
  filterModels,
  webEngines,
  selectedCloudAiModel,
  selectedWebModel,
  selectedFilterModel,
  onCloudAiModelChange,
  onWebModelChange,
  onFilterModelChange,
  reEvalProgress,
  avgConfidence,
  totalInputTokens,
  totalOutputTokens,
  totalFees,
  hideMetrics = false,
  hideHeader = false,
  onRunAll,
  onCancel,
  onExport,
  onToggleDetail,
  onReEvaluateAll,
}: Props) {
  const [reEvalModel, setReEvalModel] = useState(model);
  const { uiStyle } = useTheme();

  const isReEvaluating = !!reEvalProgress;
  const hasRunSelectors = (cloudAiModels && cloudAiModels.length > 0) || (webEngines && webEngines.length > 0);
  const isNonBuiltinWebEngine = !!webEngines?.find((e) => e.id === selectedWebModel && !e.builtin);

  const containerClasses = uiStyle === "glass"
    ? `mx-1.5 mt-1.5 mb-2 sm:m-3 rounded-xl sm:rounded-2xl glass-panel shadow-sm sticky top-0 sm:top-3 z-30 px-2.5 sm:px-6 sm:pt-4 pb-0 transition-all duration-200 ease-out overflow-hidden ${
        hideHeader ? "max-md:max-h-0 max-md:pt-0 max-md:mb-0 max-md:opacity-0 max-md:-translate-y-2 max-md:pointer-events-none" : "max-md:max-h-28 max-md:pt-2 max-md:opacity-100 max-md:translate-y-0"
      }`
    : `px-2.5 sm:px-6 sm:pt-5 pb-0 bg-white/95 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-20 transition-all duration-200 ease-out overflow-hidden ${
        hideHeader ? "max-md:max-h-0 max-md:pt-0 max-md:opacity-0 max-md:-translate-y-2 max-md:pointer-events-none max-md:border-b-0" : "max-md:max-h-28 max-md:pt-2 max-md:opacity-100 max-md:translate-y-0"
      }`;

  return (
    <div className={containerClasses}>
      {/* Row 1: Title + Badges + Model Selectors + Actions */}
      <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap min-w-0">
            <h1 className="font-bold text-slate-900 leading-tight text-[15px] sm:text-base truncate min-w-0">
              {topic}
            </h1>
            <span
              className="hidden sm:inline-flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-full font-medium shrink-0 transition-all"
              style={avgConfidence != null ? {
                background: `linear-gradient(to right, ${
                  avgConfidence >= 71 ? "#d1fae5" : avgConfidence >= 41 ? "#fef3c7" : "#fee2e2"
                } ${avgConfidence}%, #f1f5f9 ${avgConfidence}%)`,
                color: avgConfidence >= 71 ? "#047857" : avgConfidence >= 41 ? "#b45309" : "#dc2626",
              } : { background: "#f1f5f9", color: "#64748b" }}
            >
              <span className="hidden sm:inline">{model}</span>
              {avgConfidence != null && (
                <span className="font-bold tabular-nums opacity-80">
                  <span className="hidden sm:inline">· </span>{avgConfidence}%
                </span>
              )}
              {avgConfidence == null && <span className="sm:hidden">{model}</span>}
            </span>
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 text-2xs text-indigo-500 font-medium shrink-0">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                분석 중
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-auto flex flex-nowrap items-center gap-1.5 shrink-0 justify-end overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {/* Model selectors — shown inline before run button */}
          {hasRunSelectors && !allDone && (
            <>
              {cloudAiModels && cloudAiModels.length > 0 && (
                <select
                  value={selectedCloudAiModel ?? ""}
                  onChange={(e) => onCloudAiModelChange?.(e.target.value)}
                  className="flex-1 sm:flex-none min-w-0 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-2 sm:py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200 max-w-none sm:max-w-36 truncate cursor-pointer"
                >
                  {cloudAiModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
              {webEngines && webEngines.length > 0 && (
                <select
                  value={selectedWebModel ?? ""}
                  onChange={(e) => onWebModelChange?.(e.target.value)}
                  className="flex-1 sm:flex-none min-w-0 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-2 sm:py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200 max-w-none sm:max-w-36 truncate cursor-pointer"
                >
                  {webEngines.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
              {isNonBuiltinWebEngine && filterModels && filterModels.length > 0 && (
                <select
                  value={selectedFilterModel ?? ""}
                  onChange={(e) => onFilterModelChange?.(e.target.value)}
                  className="flex-1 sm:flex-none min-w-0 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-2 sm:py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200 max-w-none sm:max-w-36 truncate cursor-pointer"
                >
                  {filterModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
            </>
          )}

          {/* Export */}
          {allDone && (
            <button
              onClick={onExport}
              title="내보내기"
              className="inline-flex items-center justify-center gap-1.5 text-xs font-medium w-9 sm:w-auto px-0 sm:px-2.5 py-2 sm:py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all whitespace-nowrap"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1V8M3 5L6 8L9 5M2 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden sm:inline">내보내기</span>
            </button>
          )}

          {/* Re-evaluate all */}
          {hasDoneTasks && onReEvaluateAll && (
            <div className="hidden sm:flex items-center gap-1">
              {models && models.length > 0 ? (
                <select
                  value={reEvalModel}
                  onChange={(e) => setReEvalModel(e.target.value)}
                  disabled={isReEvaluating}
                  className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200 disabled:opacity-50 max-w-40 cursor-pointer"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={reEvalModel}
                  onChange={(e) => setReEvalModel(e.target.value)}
                  disabled={isReEvaluating}
                  placeholder="모델 ID"
                  className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-indigo-200 disabled:opacity-50"
                />
              )}
              <button
                onClick={() => onReEvaluateAll(reEvalModel)}
                disabled={isReEvaluating || !reEvalModel.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
              >
                {isReEvaluating ? (
                  <><RunningSpinner /> {reEvalProgress!.done}/{reEvalProgress!.total}</>
                ) : "전체 재평가"}
              </button>
            </div>
          )}

          {/* Cancel */}
          {isRunning && (
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 sm:py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-all whitespace-nowrap"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              중단
            </button>
          )}

          {/* Detail toggle */}
          {hasDoneTasks && (
            <button
              onClick={onToggleDetail}
              className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 sm:py-1.5 rounded-lg transition-all whitespace-nowrap ${
                showDetail
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  : "bg-slate-800 text-white hover:bg-slate-900"
              }`}
            >
              {showDetail ? "닫기" : "한 번에 보기"}
            </button>
          )}

          {/* Run all */}
          {!isRunning && !(allDone && hasDoneTasks) && (
            <button
              onClick={() => onRunAll(selectedCloudAiModel, selectedWebModel, isNonBuiltinWebEngine ? selectedFilterModel || undefined : undefined)}
              disabled={isRunning}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-200 whitespace-nowrap"
            >
              {isRunning ? <><RunningSpinner /> 실행 중</> : <><span className="sm:hidden">실행</span><span className="hidden sm:inline">전체 실행</span></>}
            </button>
          )}
          {hasDoneTasks && !isRunning && !allDone && (
            <button
              onClick={() => onRunAll(selectedCloudAiModel, selectedWebModel, isNonBuiltinWebEngine ? selectedFilterModel || undefined : undefined)}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200 whitespace-nowrap"
            >
              <span className="sm:hidden">실행</span><span className="hidden sm:inline">나머지 실행</span>
            </button>
          )}
        </div>
      </div>

      {/* Token / Cost row */}
      {(totalInputTokens || totalOutputTokens || totalFees) && (
        <div className={`items-center gap-2 sm:gap-3 flex-nowrap sm:flex-wrap transition-all duration-200 overflow-hidden ${hideMetrics ? "max-md:hidden sm:flex sm:pb-2" : "flex pb-1.5 sm:pb-2"}`}>
          {(totalInputTokens != null || totalOutputTokens != null) && (
            <span className="text-[10px] sm:text-2xs text-slate-400 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
              토큰 {((totalInputTokens ?? 0) + (totalOutputTokens ?? 0)).toLocaleString()}
              <span className="text-slate-300 mx-1">·</span>
              입력 {(totalInputTokens ?? 0).toLocaleString()}
              <span className="text-slate-300 mx-1">/</span>
              출력 {(totalOutputTokens ?? 0).toLocaleString()}
            </span>
          )}
          {totalFees != null && totalFees > 0 && (
            <span className="text-[10px] sm:text-2xs text-slate-400 tabular-nums whitespace-nowrap">
              비용 <span className="text-slate-500 font-medium">${totalFees.toFixed(4)}</span>
            </span>
          )}
        </div>
      )}

    </div>
  );
}
