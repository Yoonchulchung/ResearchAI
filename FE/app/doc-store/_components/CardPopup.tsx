"use client";

import type { SavedDocument } from "@/lib/api/documents";
import type { Experience } from "@/lib/api/experiences";
import type { ActivePopup } from "../_types";
import { CATEGORY_COLOR, DEFAULT_CATEGORY_COLOR } from "../_constants";
import { IconEdit, IconOpen, IconStar, IconTrash, IconX } from "./icons";

interface Props {
  activePopup: NonNullable<ActivePopup>;
  popupVisible: boolean;
  aiSuggestions: Record<string, string[]>;
  suggestingIds: Set<string>;
  onClose: () => void;
  onDocOpen: (id: string) => void;
  onDocDelete: (id: string) => void;
  onDocExtract: (doc: SavedDocument) => void;
  onExpEdit: (exp: Experience) => void;
  onExpDelete: (id: string) => void;
  onSuggestOne: (exp: Experience) => void;
  onApplyCategory: (exp: Experience, category: string) => Promise<void>;
}

export function CardPopup({
  activePopup,
  popupVisible,
  aiSuggestions,
  suggestingIds,
  onClose,
  onDocOpen,
  onDocDelete,
  onDocExtract,
  onExpEdit,
  onExpDelete,
  onSuggestOne,
  onApplyCategory,
}: Props) {
  const isDoc = activePopup.kind === "doc";
  const doc = isDoc ? (activePopup.data as SavedDocument) : null;
  const exp = !isDoc ? (activePopup.data as Experience) : null;

  const dateStr = new Date(activePopup.data.updatedAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric",
  });
  const color = exp?.category
    ? (CATEGORY_COLOR[exp.category] ?? DEFAULT_CATEGORY_COLOR)
    : DEFAULT_CATEGORY_COLOR;

  const aiCats = exp ? aiSuggestions[exp.id] : undefined;
  const isLoading = exp ? suggestingIds.has(exp.id) : false;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: activePopup.top,
        left: activePopup.left,
        width: activePopup.width,
        zIndex: 50,
        transformOrigin: "top left",
      }}
      className={`bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col transition-all duration-200 ${
        popupVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {exp && (
            <span className={`inline-flex items-center self-start px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${color.bg} ${color.text}`}>
              {exp.category ?? "경험"}
            </span>
          )}
          {doc && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-indigo-600 text-white">
                문서
              </span>
              {doc.companyName && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-600">
                  {doc.companyName}
                </span>
              )}
            </div>
          )}
          <h3 className="text-sm font-bold text-slate-900 leading-snug wrap-break-word">
            {activePopup.data.title}
          </h3>
          <p className="text-xs text-slate-400">{dateStr}</p>
        </div>
        <div className="ml-2 shrink-0 flex items-center gap-1">
          {isDoc ? (
            <>
              <button
                onClick={() => onDocOpen(activePopup.data.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <IconOpen /> 열기
              </button>
              <button
                onClick={() => doc && onDocExtract(doc)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                경험 추출
              </button>
              <button
                onClick={() => onDocDelete(activePopup.data.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <IconTrash /> 삭제
              </button>
            </>
          ) : (
            <>
              {exp?.sourceDocId ? (
                <button
                  onClick={() => {
                    window.location.href = `/doc-write?docId=${exp.sourceDocId}&highlight=${encodeURIComponent(exp.content)}`;
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <IconEdit /> 수정
                </button>
              ) : (
                <button
                  onClick={() => exp && onExpEdit(exp)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <IconEdit /> 수정
                </button>
              )}
              <button
                onClick={() => onExpDelete(activePopup.data.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <IconTrash /> 삭제
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
          >
            <IconX />
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="px-4 py-3 overflow-y-auto max-h-64">
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap wrap-break-word">
          {isDoc
            ? (doc?.content ?? "").replace(/#{1,6}\s/g, "").replace(/[*_`>\-]/g, "").trim()
            : exp?.content}
        </p>
      </div>

      {/* AI 추천 카테고리 (경험만) */}
      {!isDoc && exp && (
        <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 shrink-0">AI 추천</span>
          {isLoading ? (
            <span className="flex items-center gap-1 text-xs text-indigo-400">
              <span className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-500 rounded-full animate-spin" />
              분석 중...
            </span>
          ) : aiCats && aiCats.length > 0 ? (
            aiCats.map((c) => {
              const isCurrent = c === exp.category;
              return (
                <button
                  key={c}
                  onClick={() => !isCurrent && onApplyCategory(exp, c)}
                  title={isCurrent ? "현재 카테고리" : `'${c}'로 카테고리 변경`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold transition-all ${
                    CATEGORY_COLOR[c]
                      ? `${CATEGORY_COLOR[c].bg} ${CATEGORY_COLOR[c].text}`
                      : "bg-slate-100 text-slate-600"
                  } ${isCurrent ? "opacity-50 cursor-default" : "hover:opacity-80 hover:scale-105 cursor-pointer"}`}
                >
                  {c}
                  {!isCurrent && <span className="opacity-70 text-[9px]">적용</span>}
                </button>
              );
            })
          ) : (
            <span className="text-xs text-slate-300">없음</span>
          )}
          <button
            onClick={() => onSuggestOne(exp)}
            disabled={isLoading}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs text-indigo-500 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-40 transition-colors"
          >
            <IconStar />
            {aiCats ? "재추천" : "추천"}
          </button>
        </div>
      )}

    </div>
  );
}
