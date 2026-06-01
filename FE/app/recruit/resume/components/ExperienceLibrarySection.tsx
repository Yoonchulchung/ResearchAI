"use client";

import { useState } from "react";
import type { Experience } from "@/lib/api/experiences";
import { ViewSection, ViewTag } from "./ViewPrimitives";

function CoverLetterCard({ exp, onGoTo }: { exp: Experience; onGoTo: () => void }) {
  const [open, setOpen] = useState(false);
  const categories = exp.aiCategories ?? (exp.category ? [exp.category] : []);
  const keywordTags: string[] = [];
  if (exp.companyName?.trim()) keywordTags.push(exp.companyName.trim());
  if (exp.jobTitle?.trim()) keywordTags.push(exp.jobTitle.trim());

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex w-full cursor-pointer items-start justify-between py-3 text-left"
      >
        <div className="min-w-0 pr-3">
          <p className="text-sm font-semibold leading-snug text-slate-800">{exp.title}</p>
          {(keywordTags.length > 0 || categories.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {keywordTags.map((t) => (
                <span key={t} className="inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold bg-indigo-50 text-indigo-600">{t}</span>
              ))}
              {categories.map((c) => (
                <ViewTag key={c}>{c}</ViewTag>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onGoTo(); }}
            className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
          >
            바로가기
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 2H8M8 2V7M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {exp.content && (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
              className={`text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}>
              <path d="M2 4.5L6.5 9L11 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      {open && exp.content && (
        <div className="pb-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-500 line-clamp-6">{exp.content}</p>
        </div>
      )}
    </div>
  );
}

export function ExperienceLibrarySection({
  allExperiences,
  onGoTo,
}: {
  allExperiences: Experience[];
  linkedIds?: Set<string>;
  onGoTo: (exp: Experience) => void;
}) {
  const [query, setQuery] = useState("");

  if (allExperiences.length === 0) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? allExperiences.filter((exp) => {
        const cats = exp.aiCategories ?? (exp.category ? [exp.category] : []);
        return (
          exp.title?.toLowerCase().includes(q) ||
          exp.content?.toLowerCase().includes(q) ||
          cats.some((c) => c.toLowerCase().includes(q))
        );
      })
    : allExperiences;

  const grouped = filtered.reduce<Record<string, Experience[]>>((acc, exp) => {
    const cat = exp.category || "기타";
    (acc[cat] ||= []).push(exp);
    return acc;
  }, {});

  const title = q
    ? `자기소개서 라이브러리 (${filtered.length}/${allExperiences.length}건)`
    : `자기소개서 라이브러리 (${allExperiences.length}건)`;

  return (
    <ViewSection title={title}>
      <div className="mb-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-slate-400">
            <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="질문, 답변, 카테고리 검색"
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500 transition-colors">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">&apos;{query}&apos;에 해당하는 항목이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {Object.entries(grouped).map(([cat, exps]) => (
            <div key={cat}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat}</p>
              <div className="flex flex-col">
                {exps.map((exp) => (
                  <CoverLetterCard key={exp.id} exp={exp} onGoTo={() => onGoTo(exp)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ViewSection>
  );
}
