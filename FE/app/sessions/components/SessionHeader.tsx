"use client";

import { useState } from "react";
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
  onRunAll: (cloudAiModel?: string, webModel?: string, filterModel?: string) => void;
  onCancel: () => void;
  onExport: () => void;
  onToggleDetail: () => void;
  onReEvaluateAll?: (model: string) => void;
}

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 71 ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : score >= 41 ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
    : "bg-red-50 text-red-600 ring-1 ring-red-200";
  return (
    <span
      title="완료된 항목들의 평균 신뢰도"
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full tabular-nums ${color}`}
    >
      <span className="text-2xs opacity-60">avg</span>
      {score}%
    </span>
  );
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
  onRunAll,
  onCancel,
  onExport,
  onToggleDetail,
  onReEvaluateAll,
}: Props) {
  const [reEvalModel, setReEvalModel] = useState(model);
  const isReEvaluating = !!reEvalProgress;
  const hasRunSelectors = (cloudAiModels && cloudAiModels.length > 0) || (webEngines && webEngines.length > 0);
  const isNonBuiltinWebEngine = !!webEngines?.find((e) => e.id === selectedWebModel && !e.builtin);

  return (
    <div className="px-6 pt-5 pb-0 bg-white/95 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-10">
      {/* Row 1: Title + Badges + Actions */}
      <div className="flex items-start gap-3 mb-3.5">
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-900 leading-tight text-base truncate">
            {topic}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center text-2xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
              {model}
            </span>
            {avgConfidence != null && <ConfidenceBadge score={avgConfidence} />}
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 text-2xs text-indigo-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                분석 중
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* Export */}
          {allDone && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1V8M3 5L6 8L9 5M2 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              내보내기
            </button>
          )}

          {/* Re-evaluate all */}
          {hasDoneTasks && onReEvaluateAll && (
            <div className="flex items-center gap-1">
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
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-all"
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
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
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
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-200"
            >
              {isRunning ? <><RunningSpinner /> 실행 중</> : "전체 실행"}
            </button>
          )}
          {hasDoneTasks && !isRunning && !allDone && (
            <button
              onClick={() => onRunAll(selectedCloudAiModel, selectedWebModel, isNonBuiltinWebEngine ? selectedFilterModel || undefined : undefined)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
            >
              나머지 실행
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Model Selectors */}
      {hasRunSelectors && (
        <div className="flex items-center gap-2 pb-3 flex-wrap">
          <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">실행 모델</span>
          {cloudAiModels && cloudAiModels.length > 0 && (
            <select
              value={selectedCloudAiModel ?? ""}
              onChange={(e) => onCloudAiModelChange?.(e.target.value)}
              className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200 max-w-44 truncate cursor-pointer"
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
              className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200 max-w-44 truncate cursor-pointer"
            >
              {webEngines.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          )}
          {isNonBuiltinWebEngine && filterModels && filterModels.length > 0 && (
            <>
              <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">필터</span>
              <select
                value={selectedFilterModel ?? ""}
                onChange={(e) => onFilterModelChange?.(e.target.value)}
                className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200 max-w-44 truncate cursor-pointer"
              >
                {filterModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </>
          )}
          <span className="text-2xs text-slate-300">각 태스크에서 개별 변경 가능</span>
        </div>
      )}
    </div>
  );
}
