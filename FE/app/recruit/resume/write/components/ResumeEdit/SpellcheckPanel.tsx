"use client";

import type { SpellcheckState } from "./spellcheck-utils";

export function InlineSpellcheckPanel({
  state,
  onAccept,
  onReject,
  onApplyAll,
  onClose,
}: {
  state?: SpellcheckState;
  onAccept: (changeId: string) => void;
  onReject: (changeId: string) => void;
  onApplyAll: () => void;
  onClose: () => void;
}) {
  if (!state) return null;

  const pendingCount = state.changes.filter(
    (change) => change.status === "pending",
  ).length;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {state.loading && (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-100 border-t-indigo-600 animate-spin" />
          )}
          <span className="text-xs font-black text-slate-700">맞춤법 교정</span>
          {!state.loading && !state.error && (
            <span className="text-xs font-semibold text-slate-400">
              {state.changes.length > 0
                ? `${pendingCount}개 대기`
                : "수정 제안 없음"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {state.changes.length > 0 && (
            <button
              type="button"
              onClick={onApplyAll}
              disabled={state.loading || pendingCount === 0}
              className="h-7 rounded-sm border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              전체 적용
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="맞춤법 교정 닫기"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 2l8 8M10 2l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {state.loading ? (
        <p className="mt-3 text-xs font-medium text-slate-400">
          AI가 맞춤법과 띄어쓰기 오류만 확인하고 있습니다.
        </p>
      ) : state.error ? (
        <p className="mt-3 text-xs font-semibold text-red-500">{state.error}</p>
      ) : state.changes.length === 0 ? (
        <p className="mt-3 text-xs font-medium text-slate-500">
          명확한 맞춤법 오류가 발견되지 않았습니다.
        </p>
      ) : (
        <div className="mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {state.changes.map((change) => {
            const accepted = change.status === "accepted";
            const rejected = change.status === "rejected";
            return (
              <div
                key={change.id}
                className={`rounded-sm border px-3 py-2 ${
                  accepted
                    ? "border-emerald-200 bg-emerald-50/60"
                    : rejected
                      ? "border-slate-200 bg-slate-50 opacity-70"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="grid gap-1.5 text-sm leading-6">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-rose-50 text-xs font-black text-rose-600">
                      -
                    </span>
                    <span className="min-w-0 whitespace-pre-wrap break-words text-slate-500 line-through decoration-rose-300">
                      {change.before || "(추가)"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-emerald-50 text-xs font-black text-emerald-700">
                      +
                    </span>
                    <span className="min-w-0 whitespace-pre-wrap break-words font-semibold text-slate-800">
                      {change.after || "(삭제)"}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => onReject(change.id)}
                    disabled={rejected || accepted}
                    className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-200 bg-white text-sm font-black text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="교정 제안 거절"
                    title="거절"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => onAccept(change.id)}
                    disabled={accepted || rejected}
                    className="flex h-7 w-7 items-center justify-center rounded-sm border border-emerald-200 bg-emerald-50 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="교정 제안 적용"
                    title="적용"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
