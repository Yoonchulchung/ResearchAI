"use client";

import { useRef } from "react";
import type { Experience } from "@/lib/api/experiences";
import { CATEGORY_COLOR, DEFAULT_CATEGORY_COLOR } from "../_constants";
import { IconDots } from "./icons";

interface Props {
  exp: Experience;
  isActive: boolean;
  onCardClick: (el: HTMLDivElement) => void;
  aiCategories?: string[];
  suggesting?: boolean;
}

export function ExperienceCard({ exp, isActive, onCardClick, aiCategories, suggesting }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const color = exp.category
    ? (CATEGORY_COLOR[exp.category] ?? DEFAULT_CATEGORY_COLOR)
    : DEFAULT_CATEGORY_COLOR;
  const preview = exp.content.length > 120 ? exp.content.slice(0, 120) + "…" : exp.content;
  const dateStr = new Date(exp.updatedAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric",
  });

  // 직접 지정된 카테고리 제외하고 추가 AI 추천만 표시
  const extraAi = aiCategories?.filter((c) => c !== exp.category) ?? [];

  return (
    <div
      ref={ref}
      onClick={(e) => { e.stopPropagation(); ref.current && onCardClick(ref.current); }}
      className={`relative bg-white border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all min-h-64 cursor-pointer select-none ${
        isActive ? "border-indigo-300 shadow-md ring-2 ring-indigo-100" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-1 flex-wrap">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${color.bg} ${color.text}`}>
          {exp.category ?? "경험"}
        </span>
        {suggesting ? (
          <span className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-indigo-400 border border-indigo-200 bg-indigo-50">
            <span className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-500 rounded-full animate-spin" />
            AI 분석 중
          </span>
        ) : (
          extraAi.map((c) => (
            <span
              key={c}
              className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-semibold border ${
                CATEGORY_COLOR[c]
                  ? `border-transparent ${CATEGORY_COLOR[c].bg} ${CATEGORY_COLOR[c].text} opacity-80`
                  : "border-slate-300 text-slate-500"
              }`}
            >
              ✦ {c}
            </span>
          ))
        )}
        <span className="p-1 text-slate-300 ml-auto"><IconDots /></span>
      </div>
      <h3 className="text-base font-bold text-slate-900 leading-snug">{exp.title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed flex-1 line-clamp-2">{preview}</p>
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-0.5">수정일</p>
        <p className="text-sm font-medium text-slate-700">{dateStr}</p>
      </div>
    </div>
  );
}
