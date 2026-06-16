"use client";

import { useEffect, useRef, useState } from "react";
import {
  searchResume,
  type ResumeExperience,
  type ResumePrize,
  type ResumeSearchCoverLetterItem,
  type ResumeSearchExperienceItem,
  type ResumeSearchItem,
  type ResumeSearchPrizeItem,
  type ResumeSearchTrainingItem,
  type ResumeSelfIntro,
  type ResumeTraining,
} from "@/lib/api/resume";

function uid() {
  return Math.random().toString(36).slice(2);
}

function normalizeLineBreaks(value?: string | null) {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n");
}

function TypeBadge({ type }: { type: ResumeSearchItem["type"] }) {
  const map = {
    coverLetter: { label: "자소서", cls: "bg-indigo-50 text-indigo-600" },
    experience: { label: "활동", cls: "bg-emerald-50 text-emerald-600" },
    prize: { label: "수상", cls: "bg-amber-50 text-amber-600" },
    training: { label: "교육", cls: "bg-blue-50 text-blue-600" },
  };
  const { label, cls } = map[type];
  return (
    <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function CoverLetterCard({
  item,
  onInsert,
}: {
  item: ResumeSearchCoverLetterItem;
  onInsert?: (si: ResumeSelfIntro) => void;
}) {
  const [open, setOpen] = useState(false);
  const answer = normalizeLineBreaks(item.answer);
  return (
    <div className="rounded-md border border-slate-100 bg-white p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeBadge type="coverLetter" />
            {item.companyName && (
              <span className="text-[11px] text-slate-400 truncate">{item.companyName}</span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-snug line-clamp-2">{item.question || "질문 없음"}</p>
        </div>
        {onInsert && (
          <button
            onClick={() => onInsert({ id: uid(), question: item.question, answer })}
            className="shrink-0 flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            추가
          </button>
        )}
      </div>
      {answer && (
        <>
          <p className={`whitespace-pre-wrap text-xs text-slate-500 leading-relaxed ${open ? "" : "line-clamp-2"}`}>
            {answer}
          </p>
          {answer.length > 100 && (
            <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-slate-400 hover:text-slate-600 text-left">
              {open ? "접기" : "더 보기"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ExperienceCard({
  item,
  onInsert,
}: {
  item: ResumeSearchExperienceItem;
  onInsert?: (exp: ResumeExperience) => void;
}) {
  const [open, setOpen] = useState(false);
  const description = normalizeLineBreaks(item.description);
  return (
    <div className="rounded-md border border-slate-100 bg-white p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeBadge type="experience" />
            {item.activityType && (
              <span className="text-[11px] text-slate-400 truncate">{item.activityType}</span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-snug">
            {item.organizationName || "기관 없음"}
          </p>
          {(item.startDate || item.endDate) && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {[item.startDate, item.endDate].filter(Boolean).join(" ~ ")}
            </p>
          )}
        </div>
        {onInsert && (
          <button
            onClick={() =>
              onInsert({
                id: uid(),
                activityType: item.activityType,
                organizationName: item.organizationName,
                startDate: item.startDate,
                endDate: item.endDate,
                role: item.role,
                description,
              })
            }
            className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            추가
          </button>
        )}
      </div>
      {description && (
        <>
          <p className={`whitespace-pre-wrap text-xs text-slate-500 leading-relaxed ${open ? "" : "line-clamp-2"}`}>
            {description}
          </p>
          {description.length > 100 && (
            <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-slate-400 hover:text-slate-600 text-left">
              {open ? "접기" : "더 보기"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PrizeCard({
  item,
  onInsert,
}: {
  item: ResumeSearchPrizeItem;
  onInsert?: (prize: ResumePrize) => void;
}) {
  const [open, setOpen] = useState(false);
  const description = normalizeLineBreaks(item.description);
  return (
    <div className="rounded-md border border-slate-100 bg-white p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeBadge type="prize" />
            {item.companyName && (
              <span className="text-[11px] text-slate-400 truncate">{item.companyName}</span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-snug">{item.title || "제목 없음"}</p>
          {item.organization && (
            <p className="text-[11px] text-slate-400 mt-0.5">{item.organization}</p>
          )}
        </div>
        {onInsert && (
          <button
            onClick={() =>
              onInsert({
                id: uid(),
                title: item.title,
                organization: item.organization,
                issuedDate: item.issuedDate,
                description,
              })
            }
            className="shrink-0 flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            추가
          </button>
        )}
      </div>
      {description && (
        <>
          <p className={`whitespace-pre-wrap text-xs text-slate-500 leading-relaxed ${open ? "" : "line-clamp-2"}`}>
            {description}
          </p>
          {description.length > 100 && (
            <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-slate-400 hover:text-slate-600 text-left">
              {open ? "접기" : "더 보기"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TrainingCard({
  item,
  onInsert,
}: {
  item: ResumeSearchTrainingItem;
  onInsert?: (training: ResumeTraining) => void;
}) {
  const [open, setOpen] = useState(false);
  const description = normalizeLineBreaks(item.description);
  return (
    <div className="rounded-md border border-slate-100 bg-white p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeBadge type="training" />
            {item.institution && (
              <span className="text-[11px] text-slate-400 truncate">{item.institution}</span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-snug">{item.title || "교육명 없음"}</p>
          {(item.startDate || item.endDate || item.hours) && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {[item.startDate, item.endDate, item.hours ? `${item.hours}시간` : ""].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {onInsert && (
          <button
            onClick={() =>
              onInsert({
                id: uid(),
                title: item.title,
                institution: item.institution,
                startDate: item.startDate,
                endDate: item.endDate,
                hours: item.hours,
                description,
              })
            }
            className="shrink-0 flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            추가
          </button>
        )}
      </div>
      {description && (
        <>
          <p className={`whitespace-pre-wrap text-xs text-slate-500 leading-relaxed ${open ? "" : "line-clamp-2"}`}>
            {description}
          </p>
          {description.length > 100 && (
            <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-slate-400 hover:text-slate-600 text-left">
              {open ? "접기" : "더 보기"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function ResumeSearchPanel({
  onInsertSelfIntro,
  onInsertExperience,
  onInsertPrize,
  onInsertTraining,
}: {
  onInsertSelfIntro?: (si: ResumeSelfIntro) => void;
  onInsertExperience?: (exp: ResumeExperience) => void;
  onInsertPrize?: (prize: ResumePrize) => void;
  onInsertTraining?: (training: ResumeTraining) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ResumeSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setItems([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchResume(query.trim());
        setItems(results);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const coverLetters = items.filter((i): i is ResumeSearchCoverLetterItem => i.type === "coverLetter");
  const experiences = items.filter((i): i is ResumeSearchExperienceItem => i.type === "experience");
  const prizes = items.filter((i): i is ResumeSearchPrizeItem => i.type === "prize");
  const trainings = items.filter((i): i is ResumeSearchTrainingItem => i.type === "training");

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      {/* Header + search */}
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3">학내외 활동 검색</p>
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="키워드로 검색"
            className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
              <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M22 22L28 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-xs text-slate-400">이전 이력서의 자소서·교육·학내외 활동·수상을<br />검색해서 현재 항목에 추가할 수 있어요.</p>
          </div>
        ) : items.length === 0 && !loading ? (
          <p className="py-10 text-center text-xs text-slate-400">검색 결과가 없습니다.</p>
        ) : (
          <>
            {coverLetters.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">자기소개서 ({coverLetters.length})</p>
                {coverLetters.map((item) => (
                  <CoverLetterCard key={item.id} item={item} onInsert={onInsertSelfIntro} />
                ))}
              </div>
            )}
            {experiences.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">학내외 활동 ({experiences.length})</p>
                {experiences.map((item) => (
                  <ExperienceCard key={item.id} item={item} onInsert={onInsertExperience} />
                ))}
              </div>
            )}
            {trainings.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">교육 이수사항 ({trainings.length})</p>
                {trainings.map((item) => (
                  <TrainingCard key={item.id} item={item} onInsert={onInsertTraining} />
                ))}
              </div>
            )}
            {prizes.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">수상 ({prizes.length})</p>
                {prizes.map((item) => (
                  <PrizeCard key={item.id} item={item} onInsert={onInsertPrize} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
