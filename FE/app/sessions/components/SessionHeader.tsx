"use client";

interface Props {
  topic: string;
  model: string;
  isRunning: boolean;
  allDone: boolean;
  onRunAll: () => void;
  onCancel: () => void;
  onExport: () => void;
  onViewDetail: () => void;
}

export function SessionHeader({
  topic,
  model,
  isRunning,
  allDone,
  onRunAll,
  onCancel,
  onExport,
  onViewDetail,
}: Props) {
  return (
    <div className="px-8 pt-4 py-2.5 border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="font-bold text-lg text-slate-800 truncate flex-1">
          {topic}
        </h1>
        <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-medium shrink-0">
          {model}
        </span>
        {allDone && (
          <button
            onClick={onExport}
            className="text-slate-500 hover:text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors shrink-0"
          >
            내보내기
          </button>
        )}
        {isRunning && (
          <button
            onClick={onCancel}
            className="text-red-500 hover:text-red-600 font-bold text-sm px-4 py-2 rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50 transition-colors shrink-0"
          >
            ⏹ 중단
          </button>
        )}
        {allDone ? (
          <button
            onClick={onViewDetail}
            className="bg-indigo-600 text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-700 transition-colors shrink-0"
          >
            한 번에 보기
          </button>
        ) : (
          <button
            onClick={onRunAll}
            disabled={isRunning}
            className="bg-indigo-600 text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isRunning ? "분석 중..." : "전체 실행"}
          </button>
        )}
      </div>
    </div>
  );
}
