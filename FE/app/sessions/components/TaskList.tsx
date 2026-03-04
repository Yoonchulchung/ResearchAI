"use client";

import { Task } from "@/types";

export function TaskList({
  tasks,
  onUpdate,
  onRemove,
  onAdd,
}: {
  tasks: Task[];
  onUpdate: (idx: number, field: keyof Task, value: string) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700">
          조사 항목 ({tasks.length}개)
        </h2>
        <p className="text-xs text-slate-400">수정하거나 직접 추가 가능</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {tasks.map((task, idx) => (
          <div
            key={task.id}
            className="border border-slate-100 rounded-xl p-4 hover:border-indigo-200 transition-colors group"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  value={task.title}
                  onChange={(e) => onUpdate(idx, "title", e.target.value)}
                  placeholder="항목 제목"
                  className="flex-1 min-w-0 font-semibold text-sm text-slate-800 border-0 focus:outline-none bg-transparent"
                />
                <button
                  onClick={() => onRemove(idx)}
                  className="text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={task.prompt}
                onChange={(e) => onUpdate(idx, "prompt", e.target.value)}
                placeholder="검색 프롬프트"
                rows={4.5}
                className="w-full text-xs text-slate-500 border border-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200 resize-none leading-relaxed"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        className="mt-3 w-full border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 rounded-xl py-3 text-sm font-medium transition-colors"
      >
        + 항목 직접 추가
      </button>
    </div>
  );
}
