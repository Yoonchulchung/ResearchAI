"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  searchResume,
  getResumeActivities,
  type ExperienceGroup,
  type PrizeGroup,
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
import { detectCategoryFilter } from "@/recruit/resume/_lib/activity-groups";

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
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide ${cls}`}
    >
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
  const hasMore = answer.length > 100;
  return (
    <div
      className={`rounded-md border bg-white flex flex-col overflow-hidden transition-colors ${open ? "border-indigo-200" : "border-slate-100 cursor-pointer hover:border-slate-200"}`}
      onClick={() => hasMore && setOpen((v) => !v)}
    >
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeBadge type="coverLetter" />
            {item.companyName && (
              <span className="text-[11px] text-slate-400 truncate">{item.companyName}</span>
            )}
            {hasMore && (
              <span className={`ml-auto text-2xs text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-snug line-clamp-2">
            {item.question || "질문 없음"}
          </p>
          {(item.refinedTitle || item.categories.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.refinedTitle && (
                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-2xs font-semibold text-violet-600">
                  {item.refinedTitle}
                </span>
              )}
              {item.categories.map((category) => (
                <span key={category} className="rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-500">
                  {category}
                </span>
              ))}
            </div>
          )}
          {answer && !open && (
            <p className="mt-1.5 text-xs text-slate-400 line-clamp-1">{answer}</p>
          )}
        </div>
        {onInsert && (
          <button
            onClick={(e) => { e.stopPropagation(); onInsert({ id: uid(), question: item.question, answer }); }}
            className="shrink-0 flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            추가
          </button>
        )}
      </div>
      {open && answer && (
        <div className="px-3 pb-3 border-t border-indigo-100 pt-2">
          <p className="whitespace-pre-wrap text-xs text-slate-500 leading-relaxed">{answer}</p>
        </div>
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
  const hasMore = description.length > 100;
  return (
    <div
      className={`rounded-md border bg-white flex flex-col gap-0 overflow-hidden transition-colors ${open ? "border-emerald-200" : "border-slate-100 cursor-pointer hover:border-slate-200"}`}
      onClick={() => hasMore && setOpen((v) => !v)}
    >
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeBadge type="experience" />
            {item.activityType && (
              <span className="text-[11px] text-slate-400 truncate">{item.activityType}</span>
            )}
            {item.companyName && (
              <span className="text-[11px] text-slate-300 truncate">· {item.companyName}</span>
            )}
            {hasMore && (
              <span className={`ml-auto text-2xs text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
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
          {description && !open && (
            <p className="mt-1.5 text-xs text-slate-400 line-clamp-1">{description}</p>
          )}
        </div>
        {onInsert && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInsert({ id: uid(), activityType: item.activityType, organizationName: item.organizationName, startDate: item.startDate, endDate: item.endDate, role: item.role, description });
            }}
            className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            추가
          </button>
        )}
      </div>
      {open && description && (
        <div className="px-3 pb-3 border-t border-emerald-100 pt-2">
          <p className="whitespace-pre-wrap text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
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
  const hasMore = description.length > 100;
  return (
    <div
      className={`rounded-md border bg-white flex flex-col overflow-hidden transition-colors ${open ? "border-amber-200" : "border-slate-100 cursor-pointer hover:border-slate-200"}`}
      onClick={() => hasMore && setOpen((v) => !v)}
    >
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeBadge type="prize" />
            {item.companyName && (
              <span className="text-[11px] text-slate-400 truncate">{item.companyName}</span>
            )}
            {hasMore && (
              <span className={`ml-auto text-2xs text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-snug">
            {item.title || "제목 없음"}
          </p>
          {(item.organization || item.issuedDate) && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {[item.organization, item.issuedDate].filter(Boolean).join(" · ")}
            </p>
          )}
          {description && !open && (
            <p className="mt-1.5 text-xs text-slate-400 line-clamp-1">{description}</p>
          )}
        </div>
        {onInsert && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInsert({ id: uid(), title: item.title, organization: item.organization, issuedDate: item.issuedDate, description });
            }}
            className="shrink-0 flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            추가
          </button>
        )}
      </div>
      {open && description && (
        <div className="px-3 pb-3 border-t border-amber-100 pt-2">
          <p className="whitespace-pre-wrap text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
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
          <p className="text-xs font-semibold text-slate-700 leading-snug">
            {item.title || "교육명 없음"}
          </p>
          {(item.startDate || item.endDate || item.hours) && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {[item.startDate, item.endDate, item.hours ? `${item.hours}시간` : ""]
                .filter(Boolean)
                .join(" · ")}
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
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
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

// 활동 유형별 접기/펼치기 섹션 (탐색 모드)
function ActivityTypeSection({
  activityType,
  items,
  onInsert,
  defaultOpen = false,
}: {
  activityType: string;
  items: ResumeSearchExperienceItem[];
  onInsert?: (exp: ResumeExperience) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-md border border-emerald-100 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-emerald-50/50 transition-colors"
      >
        <span className="rounded-md px-2 py-1 text-xs font-black bg-emerald-50 text-emerald-700">
          {activityType || "기타"}
        </span>
        <span className="text-xs font-semibold text-slate-400">{items.length}개</span>
        <span className={`ml-auto text-2xs text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {items.map((item) => (
            <div key={item.id} className="px-3 py-2.5">
              <ExperienceCard item={item} onInsert={onInsert} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExperienceGroupItemRow({
  item,
  onInsert,
}: {
  item: ResumeSearchExperienceItem;
  onInsert?: (exp: ResumeExperience) => void;
}) {
  const [open, setOpen] = useState(false);
  const description = normalizeLineBreaks(item.description);
  const hasDesc = description.length > 0;
  return (
    <div
      className={`px-3 py-2.5 ${hasDesc ? "cursor-pointer hover:bg-slate-50/60" : ""}`}
      onClick={() => hasDesc && setOpen((v) => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {item.activityType && (
            <span className="text-2xs text-slate-400">{item.activityType}</span>
          )}
          <p className="text-xs font-semibold text-slate-700 leading-snug">{item.organizationName}</p>
          {item.companyName && (
            <p className="text-[11px] text-slate-400 mt-0.5">{item.companyName} · {item.jobTitle}</p>
          )}
          {description && (
            <p className={`mt-1 text-xs text-slate-500 ${open ? "whitespace-pre-wrap leading-relaxed" : "line-clamp-1"}`}>
              {description}
            </p>
          )}
        </div>
        {onInsert && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInsert({ id: uid(), activityType: item.activityType, organizationName: item.organizationName, startDate: item.startDate, endDate: item.endDate, role: item.role, description });
            }}
            className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            추가
          </button>
        )}
      </div>
    </div>
  );
}

function ExperienceGroupCard({
  group,
  onInsert,
}: {
  group: ExperienceGroup;
  onInsert?: (exp: ResumeExperience) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.items : group.items.slice(0, 1);
  const hasMore = group.items.length > 1;

  if (!hasMore) {
    return <ExperienceCard item={group.items[0]} onInsert={onInsert} />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-emerald-100 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-emerald-50/60 transition-colors"
      >
        <span className="rounded-md px-2 py-1 text-xs font-black bg-emerald-50 text-emerald-700">
          {group.key || "활동"}
        </span>
        <span className="text-xs font-semibold text-slate-400">
          {group.items.length}개 이력서
        </span>
        <span className={`ml-auto text-2xs text-slate-300 transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
      </button>
      <div className="border-t border-slate-100 divide-y divide-slate-100">
        {visible.map((item) => (
          <ExperienceGroupItemRow key={item.id} item={item} onInsert={onInsert} />
        ))}
        {!expanded && hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 text-left"
          >
            {group.items.length - 1}개 더 보기
          </button>
        )}
      </div>
    </div>
  );
}

function PrizeGroupItemRow({
  item,
  onInsert,
}: {
  item: ResumeSearchPrizeItem;
  onInsert?: (prize: ResumePrize) => void;
}) {
  const [open, setOpen] = useState(false);
  const description = normalizeLineBreaks(item.description);
  return (
    <div className="px-3 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-700 leading-snug">{item.title}</p>
          {(item.organization || item.issuedDate) && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {[item.organization, item.issuedDate].filter(Boolean).join(" · ")}
            </p>
          )}
          {item.companyName && (
            <p className="text-[11px] text-slate-300 mt-0.5">{item.companyName} · {item.jobTitle}</p>
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
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
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

function PrizeGroupCard({
  group,
  onInsert,
}: {
  group: PrizeGroup;
  onInsert?: (prize: ResumePrize) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = group.items.length > 1;

  if (!hasMore) {
    return <PrizeCard item={group.items[0]} onInsert={onInsert} />;
  }

  const visible = expanded ? group.items : group.items.slice(0, 1);

  return (
    <div className="overflow-hidden rounded-md border border-amber-100 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-amber-50/60 transition-colors"
      >
        <span className="rounded-md px-2 py-1 text-xs font-black bg-amber-50 text-amber-700">
          {group.key || "수상"}
        </span>
        <span className="text-xs font-semibold text-slate-400">
          {group.items.length}개 이력서
        </span>
        <span className={`ml-auto text-2xs text-slate-300 transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
      </button>
      <div className="border-t border-slate-100 divide-y divide-slate-100">
        {visible.map((item) => (
          <PrizeGroupItemRow key={item.id} item={item} onInsert={onInsert} />
        ))}
        {!expanded && hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 text-left"
          >
            {group.items.length - 1}개 더 보기
          </button>
        )}
      </div>
    </div>
  );
}

export default function ResumeSearchPanel({
  resumeId,
  onInsertSelfIntro,
  onInsertExperience,
  onInsertPrize,
  onInsertTraining,
}: {
  resumeId?: string;
  onInsertSelfIntro?: (si: ResumeSelfIntro) => void;
  onInsertExperience?: (exp: ResumeExperience) => void;
  onInsertPrize?: (prize: ResumePrize) => void;
  onInsertTraining?: (training: ResumeTraining) => void;
}) {
  const [query, setQuery] = useState("");
  const [expGroups, setExpGroups] = useState<ExperienceGroup[]>([]);
  const [prizeGroups, setPrizeGroups] = useState<PrizeGroup[]>([]);
  const [searchItems, setSearchItems] = useState<ResumeSearchItem[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all activities on mount (grouped by BE)
  useEffect(() => {
    setAllLoading(true);
    getResumeActivities(resumeId)
      .then((res) => {
        setExpGroups(res.experienceGroups);
        setPrizeGroups(res.prizeGroups);
      })
      .catch(() => {})
      .finally(() => setAllLoading(false));
  }, [resumeId]);

  // Search when query changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setSearchItems([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchResume(query.trim(), resumeId);
        setSearchItems(results);
      } catch {
        setSearchItems([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, resumeId]);

  const isSearchMode = query.trim().length > 0;
  const categoryFilter = isSearchMode ? detectCategoryFilter(query) : null;

  // 검색 결과에서 타입별 분류 (flat 리스트 — 개별 ExperienceCard로 렌더)
  const searchExperiences = useMemo((): ResumeSearchExperienceItem[] => {
    if (!isSearchMode) return [];
    if (categoryFilter === "experience") return expGroups.flatMap((g) => g.items);
    return searchItems.filter((i): i is ResumeSearchExperienceItem => i.type === "experience");
  }, [isSearchMode, categoryFilter, expGroups, searchItems]);

  const searchPrizes = useMemo((): ResumeSearchPrizeItem[] => {
    if (!isSearchMode) return [];
    if (categoryFilter === "prize") return prizeGroups.flatMap((g) => g.items);
    return searchItems.filter((i): i is ResumeSearchPrizeItem => i.type === "prize");
  }, [isSearchMode, categoryFilter, prizeGroups, searchItems]);

  const coverLetters = useMemo(
    () => (isSearchMode && !categoryFilter ? searchItems.filter((i): i is ResumeSearchCoverLetterItem => i.type === "coverLetter") : []),
    [isSearchMode, categoryFilter, searchItems],
  );
  const trainings = useMemo(
    () => (isSearchMode && !categoryFilter ? searchItems.filter((i): i is ResumeSearchTrainingItem => i.type === "training") : []),
    [isSearchMode, categoryFilter, searchItems],
  );

  const isLoading = allLoading || (isSearchMode && searchLoading);
  const isEmpty = !isLoading && (
    isSearchMode
      ? searchExperiences.length === 0 && searchPrizes.length === 0 && coverLetters.length === 0 && trainings.length === 0
      : expGroups.length === 0 && prizeGroups.length === 0
  );

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      {/* Header + search */}
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3">
          학내외 활동 · 수상
        </p>
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="키워드·수상·활동 검색"
            className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
          {isLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {allLoading ? (
          <div className="flex flex-col gap-2 animate-pulse">
            {[80, 65, 90, 70].map((w, i) => (
              <div key={i} className="rounded-md border border-slate-100 bg-white p-3">
                <div className="h-2.5 rounded bg-slate-100 mb-2" style={{ width: `${w}%` }} />
                <div className="h-2 rounded bg-slate-100 opacity-60" style={{ width: "95%" }} />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
              <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M22 22L28 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-xs text-slate-400">
              {isSearchMode ? "검색 결과가 없습니다." : "저장된 활동·수상이 없습니다."}
            </p>
          </div>
        ) : (
          <>
            {/* 탐색 모드: BE 그룹 기반 */}
            {!isSearchMode && (
              <>
                {expGroups.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      학내외 활동 ({expGroups.reduce((s, g) => s + g.items.length, 0)})
                    </p>
                    {expGroups.map((group, i) => (
                      <ExperienceGroupCard key={group.key + i} group={{ id: `eg-${i}`, ...group }} onInsert={onInsertExperience} />
                    ))}
                  </div>
                )}
                {prizeGroups.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      수상 ({prizeGroups.reduce((s, g) => s + g.items.length, 0)})
                    </p>
                    {prizeGroups.map((group, i) => (
                      <PrizeGroupCard key={group.key + i} group={{ id: `pg-${i}`, ...group }} onInsert={onInsertPrize} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 검색 모드: 개별 카드 (더 보기 포함) */}
            {isSearchMode && (
              <>
                {coverLetters.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      자기소개서 ({coverLetters.length})
                    </p>
                    {coverLetters.map((item) => (
                      <CoverLetterCard key={item.id} item={item} onInsert={onInsertSelfIntro} />
                    ))}
                  </div>
                )}
                {searchExperiences.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      학내외 활동 ({searchExperiences.length})
                    </p>
                    {searchExperiences.map((item) => (
                      <ExperienceCard key={item.id} item={item} onInsert={onInsertExperience} />
                    ))}
                  </div>
                )}
                {trainings.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      교육 이수사항 ({trainings.length})
                    </p>
                    {trainings.map((item) => (
                      <TrainingCard key={item.id} item={item} onInsert={onInsertTraining} />
                    ))}
                  </div>
                )}
                {searchPrizes.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      수상 ({searchPrizes.length})
                    </p>
                    {searchPrizes.map((item) => (
                      <PrizeCard key={item.id} item={item} onInsert={onInsertPrize} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
