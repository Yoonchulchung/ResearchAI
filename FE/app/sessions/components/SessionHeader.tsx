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
  reEvalProgress?: { done: number; total: number } | null;
  avgConfidence?: number | null;
  onRunAll: () => void;
  onCancel: () => void;
  onExport: () => void;
  onToggleDetail: () => void;
  onReEvaluateAll?: (model: string) => void;
}

export function SessionHeader({
  topic,
  model,
  isRunning,
  allDone,
  hasDoneTasks,
  showDetail,
  models,
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

  return (
    <div className="px-8 pt-4 py-2.5 border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="font-bold text-lg text-slate-800 truncate flex-1">
          {topic}
        </h1>
        <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-medium shrink-0">
          {model}
        </span>
        {avgConfidence != null && (
          <span
            title="완료된 항목들의 평균 신뢰도"
            className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
              avgConfidence >= 71 ? "bg-green-100 text-green-700"
              : avgConfidence >= 41 ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700"
            }`}
          >
            평균 신뢰도 {avgConfidence}%
          </span>
        )}
        {allDone && (
          <button
            onClick={onExport}
            className="text-slate-500 hover:text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors shrink-0"
          >
            내보내기
          </button>
        )}
        {/* 전체 신뢰도 재평가 */}
        {hasDoneTasks && onReEvaluateAll && (
          <div className="flex items-center gap-1.5 shrink-0">
            {models && models.length > 0 ? (
              <select
                value={reEvalModel}
                onChange={(e) => setReEvalModel(e.target.value)}
                disabled={isReEvaluating}
                className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200 disabled:opacity-50 max-w-44"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={reEvalModel}
                onChange={(e) => setReEvalModel(e.target.value)}
                disabled={isReEvaluating}
                placeholder="모델 ID"
                className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 w-40 focus:outline-none focus:ring-1 focus:ring-indigo-200 disabled:opacity-50"
              />
            )}
            <button
              onClick={() => onReEvaluateAll(reEvalModel)}
              disabled={isReEvaluating || !reEvalModel.trim()}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isReEvaluating
                ? `재평가 중 ${reEvalProgress!.done}/${reEvalProgress!.total}`
                : "📊 전체 재평가"}
            </button>
          </div>
        )}
        {isRunning && (
          <button
            onClick={onCancel}
            className="text-red-500 hover:text-red-600 font-bold text-sm px-4 py-2 rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50 transition-colors shrink-0"
          >
            ⏹ 중단
          </button>
        )}
        {hasDoneTasks && (
          <button
            onClick={onToggleDetail}
            className={`font-bold text-sm px-5 py-2 rounded-xl transition-colors shrink-0 ${
              showDetail
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-slate-500 text-white hover:bg-slate-600"
            }`}
          >
            {showDetail ? "닫기" : "한 번에 보기"}
          </button>
        )}
        {!hasDoneTasks && (
          <button
            onClick={onRunAll}
            disabled={isRunning}
            className="bg-indigo-600 text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isRunning ? "분석 중..." : "전체 실행"}
          </button>
        )}
        {hasDoneTasks && !isRunning && !allDone && (
          <button
            onClick={onRunAll}
            className="bg-indigo-600 text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-700 transition-colors shrink-0"
          >
            전체 실행
          </button>
        )}
      </div>
    </div>
  );
}
