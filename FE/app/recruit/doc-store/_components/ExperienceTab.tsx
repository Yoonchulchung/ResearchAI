"use client";

import type { Experience } from "@/lib/api/experiences";
import type { ActivePopup } from "../_types";
import { AI_MODELS } from "../_constants";
import { ExperienceCard } from "./ExperienceCard";
import { IconPlus, IconStar } from "./icons";

interface Props {
  expLoading: boolean;
  filteredExp: Experience[];
  expSearch: string;
  setExpSearch: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  allCategories: string[];
  activePopup: ActivePopup;
  onCardClick: (exp: Experience, el: HTMLDivElement) => void;
  onOpenAdd: () => void;
  // AI suggest
  aiModel: string;
  setAiModel: (v: string) => void;
  aiSuggestions: Record<string, string[]>;
  suggestingIds: Set<string>;
  suggestingAll: boolean;
  onSuggestAll: () => void;
  onClearSuggestions: () => void;
}

export function ExperienceTab({
  expLoading,
  filteredExp,
  expSearch,
  setExpSearch,
  categoryFilter,
  setCategoryFilter,
  allCategories,
  activePopup,
  onCardClick,
  onOpenAdd,
  aiModel,
  setAiModel,
  aiSuggestions,
  suggestingIds,
  suggestingAll,
  onSuggestAll,
  onClearSuggestions,
}: Props) {
  return (
    <>
      {/* 카테고리 필터 */}
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b border-slate-100 shrink-0 overflow-x-auto">
        <button
          onClick={() => setCategoryFilter("")}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all shrink-0 ${
            !categoryFilter
              ? "bg-slate-800 text-white border-slate-800"
              : "text-slate-500 border-slate-200 hover:border-slate-300"
          }`}
        >
          전체
        </button>
        {allCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c === categoryFilter ? "" : c)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all shrink-0 ${
              categoryFilter === c
                ? "bg-indigo-600 text-white border-indigo-600"
                : "text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* AI 카테고리 추천 */}
      <div className="flex items-center gap-2 px-5 py-2 bg-indigo-50/60 border-b border-indigo-100 shrink-0">
        <IconStar />
        <span className="text-xs font-semibold text-indigo-600 shrink-0">AI 카테고리 추천</span>
        <select
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value)}
          className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button
          onClick={onSuggestAll}
          disabled={suggestingAll || filteredExp.length === 0}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {suggestingAll ? (
            <span className="w-2.5 h-2.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <IconStar />
          )}
          전체 추천
        </button>
        {Object.keys(aiSuggestions).length > 0 && (
          <button
            onClick={onClearSuggestions}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            초기화
          </button>
        )}
      </div>

      {/* 카드 목록 */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {expLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">로딩 중...</div>
        ) : filteredExp.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-300">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" strokeWidth="2" />
              <path d="M16 16H32M16 22H28M16 28H24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="36" cy="12" r="6" fill="#E0E7FF" stroke="#6366F1" strokeWidth="1.5" />
              <path d="M34 12H38M36 10V14" stroke="#6366F1" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-400">
                {expSearch || categoryFilter ? "검색 결과가 없습니다" : "아직 저장된 경험이 없습니다"}
              </p>
              {!expSearch && !categoryFilter && (
                <p className="text-xs text-slate-300 mt-1">
                  경험을 추가하면 자소서 작성 시 AI가 자동으로 매칭합니다
                </p>
              )}
            </div>
            {!expSearch && !categoryFilter && (
              <button
                onClick={onOpenAdd}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <IconPlus /> 첫 경험 추가하기
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
            {filteredExp.map((exp) => (
              <ExperienceCard
                key={exp.id}
                exp={exp}
                isActive={activePopup?.data.id === exp.id}
                onCardClick={(el) => onCardClick(exp, el)}
                aiCategories={aiSuggestions[exp.id]}
                suggesting={suggestingIds.has(exp.id) || (suggestingAll && !aiSuggestions[exp.id])}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
