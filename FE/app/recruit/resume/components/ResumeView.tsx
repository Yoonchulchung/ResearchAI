"use client";

import { useRef, useState } from "react";
import type { ResumeProfile, ResumeSelfIntro, ResumeTarget } from "@/lib/api/resume";
import { useAuth } from "@/contexts/AuthContext";
import { IconEvaluate } from "../../_components/icons";
import { MODELS } from "../../_constants";
import { ExpandableCard, ViewSection, ViewTag } from "./ViewPrimitives";
import ResumeSidebar, { type ResumeSidebarRef } from "./ResumeSidebar";

function groupTargetsByYear(targets: ResumeTarget[]) {
  const sorted = [...targets].sort((a, b) => {
    const aDate = a.appliedAt?.trim() ?? "";
    const bDate = b.appliedAt?.trim() ?? "";
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "");
  });
  const indexed = sorted.map((target, i) => ({ target, displayIndex: i }));
  const grouped = indexed.reduce<Map<string, { target: ResumeTarget; displayIndex: number }[]>>((acc, item) => {
    const year = item.target.appliedAt?.match(/^(\d{4})/)?.[1] ?? "날짜 미입력";
    if (!acc.has(year)) acc.set(year, []);
    acc.get(year)!.push(item);
    return acc;
  }, new Map());

  return [...grouped.keys()]
    .sort((a, b) => {
      if (a === "날짜 미입력") return 1;
      if (b === "날짜 미입력") return -1;
      return b.localeCompare(a);
    })
    .map((year) => ({ year, items: grouped.get(year)! }));
}

function EmptyResumeState({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-400">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="6" y="4" width="28" height="32" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 13h14M13 19h14M13 25h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <p className="text-sm">아직 작성된 이력서가 없습니다.</p>
      <button
        onClick={onEdit}
        className="rounded-md border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        이력서 추가
      </button>
    </div>
  );
}

export function ResumeTargetList({
  targets,
  onSelectTarget,
}: {
  targets: ResumeTarget[];
  onSelectTarget: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? targets.filter(
        (t) =>
          t.companyName?.toLowerCase().includes(q) ||
          t.jobTitle?.toLowerCase().includes(q),
      )
    : targets;

  const grouped = groupTargetsByYear(filtered);

  const title = q
    ? `기업별 이력서 (${filtered.length}/${targets.length}건)`
    : `기업별 이력서 (${targets.length}건)`;

  return (
    <ViewSection title={title}>
      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-slate-400">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="기업명, 직무 검색"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500 transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">&apos;{query}&apos;에 해당하는 이력서가 없습니다.</p>
      ) : (
        <div className="flex flex-col">
          {grouped.map(({ year, items }) => (
            <div key={year}>
              <div className="flex items-center gap-3 pb-2 pt-1 first:pt-0">
                <span className="text-xs font-bold text-slate-400">{year}</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              {items.map(({ target, displayIndex }) => (
                <button
                  key={target.id}
                  onClick={() => onSelectTarget(target.id)}
                  className="-mx-1 flex items-center gap-5 rounded-md border-b border-slate-100 px-1 py-4 text-left transition-colors last:border-0 hover:bg-slate-50 group"
                >
                  <span className="w-9 shrink-0 select-none text-2xl font-black leading-none tabular-nums text-slate-200 transition-colors group-hover:text-indigo-200">
                    {String(displayIndex + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-slate-900">{target.companyName || "기업명 미입력"}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {target.jobTitle ? <ViewTag>{target.jobTitle}</ViewTag> : <ViewTag>직무 미입력</ViewTag>}
                      {target.appliedAt && <ViewTag>{target.appliedAt.slice(5)}</ViewTag>}
                      <ViewTag>{target.selfIntroductions.length}문항</ViewTag>
                    </div>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="shrink-0 text-slate-300 transition-colors group-hover:text-indigo-400"
                  >
                    <path
                      d="M4.5 2.5L9.5 7L4.5 11.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </ViewSection>
  );
}

function SelfIntroEvaluateCard({
  title,
  answer,
  category,
  isActive,
  loading,
  onEvaluate,
}: {
  title: string;
  answer: string;
  category: string[];
  isActive: boolean;
  loading: boolean;
  onEvaluate: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`border-b border-slate-100 last:border-0 ${isActive ? "bg-indigo-50/30 -mx-3 px-3 rounded-md" : ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between py-3.5 text-left"
      >
        <div className="min-w-0 pr-4">
          <p className="text-sm font-semibold leading-snug text-slate-800">{title}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            공백 포함 {answer.length.toLocaleString()}자 · 공백 제외 {answer.replace(/\s/g, "").length.toLocaleString()}자
          </p>
          {category.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {category.map((item) => (
                <ViewTag key={item}>{item}</ViewTag>
              ))}
            </div>
          )}
        </div>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
          className={`mt-0.5 shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 4.5L6.5 9L11 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="pb-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{answer || "답변이 없습니다."}</p>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onEvaluate}
              disabled={!answer.trim() || loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isActive && loading ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              ) : (
                <IconEvaluate />
              )}
              글 평가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResumeTargetDetail({
  selectedTarget,
  onBackToList,
}: {
  selectedTarget: ResumeTarget;
  onBackToList: () => void;
}) {
  const experiences = selectedTarget.experiences ?? [];
  const normalExperiences = experiences.filter((exp) => exp.activityType !== "해외 경험");
  const overseasExperiences = experiences.filter((exp) => exp.activityType === "해외 경험");
  const prizes = selectedTarget.prizes ?? [];
  const trainings = selectedTarget.trainings ?? [];
  const { user } = useAuth();
  const [loadingIndices, setLoadingIndices] = useState<Set<number>>(new Set());
  const sidebarRef = useRef<ResumeSidebarRef>(null);

  const handleEvaluate = async (si: ResumeSelfIntro, index: number) => {
    const answer = si.answer.trim();
    if (!answer) return;
    const evalModel = user?.defaultCloudModel ?? MODELS[0].id;
    const content = [
      selectedTarget.companyName ? `기업명: ${selectedTarget.companyName}` : "",
      selectedTarget.jobTitle ? `직무: ${selectedTarget.jobTitle}` : "",
      selectedTarget.jd ? `JD:\n${selectedTarget.jd}` : "",
      si.question ? `문항: ${si.question}` : "",
      `답변:\n${answer}`,
    ].filter(Boolean).join("\n\n");
    const title = si.question
      ? `문항 ${index + 1}: ${si.question.slice(0, 30)}${si.question.length > 30 ? "…" : ""}`
      : `문항 ${index + 1}`;
    setLoadingIndices((prev) => new Set([...prev, index]));
    sidebarRef.current?.startEval(si.id, title, content, evalModel);
    setLoadingIndices((prev) => { const n = new Set(prev); n.delete(index); return n; });
  };

  return (
    <div className="h-full flex min-h-0 print:block print:h-auto">
      {/* Left: resume content */}
      <div className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="px-5 py-8 max-w-2xl mx-auto print:max-w-none print:px-10 print:py-8">
          <button
            onClick={onBackToList}
            className="mb-4 flex w-fit items-center gap-1 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-800 print:hidden"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            이력서 목록
          </button>

          <ViewSection title="지원 이력서">
            <div className="mb-5 flex flex-wrap items-baseline gap-3">
              <p className="text-2xl font-black tracking-tight text-slate-900">{selectedTarget.companyName || "기업명 미입력"}</p>
              {selectedTarget.jobTitle && <ViewTag>{selectedTarget.jobTitle}</ViewTag>}
              {selectedTarget.appliedAt && <ViewTag>지원일 {selectedTarget.appliedAt}</ViewTag>}
            </div>
            {selectedTarget.jd ? (
              <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
                <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-slate-400">JD</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selectedTarget.jd}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">채용공고 JD가 입력되지 않았습니다.</p>
            )}
          </ViewSection>

          {trainings.length > 0 && (
            <ViewSection title={`교육 이수사항 (${trainings.length}건)`}>
              <div className="flex flex-col gap-2">
                {trainings.map((training) => (
                  <ExpandableCard
                    key={training.id}
                    title={[training.title || "교육명 미입력", training.institution || "교육기관명 미입력"].join(" · ")}
                    sub={[
                      training.startDate,
                      training.endDate ? `~ ${training.endDate}` : "",
                      training.hours ? `${training.hours}시간` : "",
                    ].filter(Boolean).join(" ")}
                    content={training.description ?? ""}
                  />
                ))}
              </div>
            </ViewSection>
          )}

          {normalExperiences.length > 0 && (
            <ViewSection title={`학내외 활동 (${normalExperiences.length}건)`}>
              <div className="flex flex-col gap-2">
                {normalExperiences.map((exp) => (
                  <ExpandableCard
                    key={exp.id}
                    title={[exp.activityType || "활동구분 미입력", exp.organizationName || "기관/조직명 미입력"].join(" · ")}
                    sub={[exp.startDate, exp.endDate ? `~ ${exp.endDate}` : "", exp.role].filter(Boolean).join(" ")}
                    content={exp.description ?? ""}
                  />
                ))}
              </div>
            </ViewSection>
          )}

          {prizes.length > 0 && (
            <ViewSection title={`수상 (${prizes.length}건)`}>
              <div className="flex flex-col gap-2">
                {prizes.map((prize) => (
                  <ExpandableCard
                    key={prize.id}
                    title={[prize.title || "상훈명 미입력", prize.organization || "수여기관 미입력"].join(" · ")}
                    sub={prize.issuedDate ?? undefined}
                    content={prize.description ?? ""}
                  />
                ))}
              </div>
            </ViewSection>
          )}

          {overseasExperiences.length > 0 && (
            <ViewSection title={`해외 활동 (${overseasExperiences.length}건)`}>
              <div className="flex flex-col gap-2">
                {overseasExperiences.map((exp) => (
                  <ExpandableCard
                    key={exp.id}
                    title={exp.organizationName || "기관/프로그램명 미입력"}
                    sub={[exp.startDate, exp.endDate ? `~ ${exp.endDate}` : "", exp.role].filter(Boolean).join(" ")}
                    content={exp.description ?? ""}
                  />
                ))}
              </div>
            </ViewSection>
          )}

          {selectedTarget.selfIntroductions.length > 0 && (
            <ViewSection title={`자기소개서 (${selectedTarget.selfIntroductions.length}문항)`}>
              <div className="flex flex-col gap-2">
                {selectedTarget.selfIntroductions.map((si, index) => (
                  <SelfIntroEvaluateCard
                    key={si.id}
                    title={si.question || `문항 ${index + 1}`}
                    answer={si.answer}
                    category={si.category ?? []}
                    isActive={loadingIndices.has(index)}
                    loading={loadingIndices.has(index)}
                    onEvaluate={() => handleEvaluate(si, index)}
                  />
                ))}
              </div>
            </ViewSection>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <ResumeSidebar ref={sidebarRef} resumeId={selectedTarget.id} target={selectedTarget} />
    </div>
  );
}

export function ResumeView({
  profile,
  onEdit,
  onSelectTarget,
}: {
  profile: ResumeProfile;
  onEdit: () => void;
  onSelectTarget: (id: string) => void;
}) {
  const targets = profile.resumeTargets ?? [];

  return (
    <div className="flex flex-col">
      {targets.length === 0 ? (
        <EmptyResumeState onEdit={onEdit} />
      ) : (
        <ResumeTargetList targets={targets} onSelectTarget={onSelectTarget} />
      )}
    </div>
  );
}
