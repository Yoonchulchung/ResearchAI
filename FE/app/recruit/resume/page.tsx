"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getResume, saveResume,
  type ResumeProfile,
  type ResumeLanguage, type ResumeSkill,
  type ResumeAward, type ResumeActivity, type ResumeOverseas,
  type ResumeSelfIntro, type ResumeTarget,
} from "@/lib/api/resume";
import { createExperience, updateExperience, getExperiences, type Experience } from "@/lib/api/experiences";
import { streamWriteAssist } from "@/lib/api/ai";
import { enqueueRecruitAssist } from "@/lib/api/recruit/assist";
import { API_BASE, getAuthHeaders } from "@/lib/api/base";
import { IconEvaluate } from "../_components/icons";
import { MODELS, PROSE_CLASS } from "../_constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

const EMPTY_PROFILE: ResumeProfile = {
  basicInfo: { name: "", englishName: "", gender: "", birthDate: "", email: "", phone: "", address: "", nationality: "대한민국", hobby: "", motto: "" },
  education: [], languages: [], skills: [], military: undefined,
  awards: [], activities: [], overseas: [], selfIntroductions: [], resumeTargets: [],
};

function createResumeTarget(): ResumeTarget {
  return { id: uid(), companyName: "", jobTitle: "", jd: "", selfIntroductions: [] };
}

function normalizeResumeProfile(profile: ResumeProfile): ResumeProfile {
  if (profile.resumeTargets && profile.resumeTargets.length > 0) return profile;
  if (profile.selfIntroductions.length > 0) {
    const groups = new Map<string, ResumeTarget>();
    for (const intro of profile.selfIntroductions) {
      const key = [intro.companyName ?? "", intro.jobTitle ?? "", intro.jd ?? ""].join("\n");
      const current = groups.get(key) ?? {
        id: uid(),
        companyName: intro.companyName ?? "",
        jobTitle: intro.jobTitle ?? "",
        jd: intro.jd ?? "",
        selfIntroductions: [],
      };
      current.selfIntroductions.push(intro);
      groups.set(key, current);
    }
    return { ...profile, resumeTargets: [...groups.values()] };
  }
  return { ...profile, resumeTargets: [createResumeTarget()] };
}

async function extractJdTextFromImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "gemini-2.0-flash");

  const res = await fetch(`${API_BASE}/media/extract-image-text`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  const raw = await res.json().catch(() => ({}));
  const data = raw?.isSuccess === true && "result" in raw ? raw.result : raw;
  if (!res.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "이미지 텍스트 추출에 실패했습니다.");
  }
  return String(data?.text ?? "").trim();
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
      <span className="w-1 h-4 rounded-full bg-indigo-500 shrink-0" />
      {children}
    </h2>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 py-6 text-center">{children}</p>;
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={5}
          className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-300 resize-y leading-relaxed" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? label}
          className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-300" />
      )}
    </div>
  );
}

// ─── View mode components ──────────────────────────────────────────────────────

function ViewTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">{children}</span>;
}

function ViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function ExpandableCard({ title, sub, content, defaultOpen = false }: { title: string; sub?: string; content?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {content && (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            className={`shrink-0 ml-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M2 4.5L6.5 9L11 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open && content && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mt-3">{content}</p>
        </div>
      )}
    </div>
  );
}

function parseSelfIntroExperienceContent(content?: string) {
  const text = content ?? "";
  const question = text.match(/(?:^|\n)문항:\s*([\s\S]*?)(?=\n\s*\n답변:|$)/)?.[1]?.trim();
  const answer = text.match(/(?:^|\n)답변:\s*([\s\S]*)$/)?.[1]?.trim();
  return {
    question,
    answer: answer || text.trim(),
  };
}

function ExperienceLibrarySection({ allExperiences, linkedIds }: { allExperiences: Experience[]; linkedIds: Set<string> }) {
  if (allExperiences.length === 0) return null;

  const grouped = allExperiences.reduce<Record<string, Experience[]>>((acc, exp) => {
    const cat = exp.category || "기타";
    (acc[cat] ||= []).push(exp);
    return acc;
  }, {});

  return (
    <ViewSection title={`경험 라이브러리 (${allExperiences.length}건)`}>
      <div className="flex flex-col gap-3">
        {Object.entries(grouped).map(([cat, exps]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{cat}</p>
            <div className="flex flex-col gap-1.5">
              {exps.map((exp) => (
                (() => {
                  const isSelfIntro = exp.category === "자기소개서";
                  const parsed = isSelfIntro ? parseSelfIntroExperienceContent(exp.content) : null;
                  return (
                    <ExpandableCard
                      key={exp.id}
                      title={isSelfIntro && parsed?.question ? `${exp.title} · ${parsed.question}` : exp.title}
                      content={isSelfIntro ? parsed?.answer : exp.content}
                    />
                  );
                })()
              ))}
            </div>
          </div>
        ))}
      </div>
    </ViewSection>
  );
}

function ResumeView({
  profile,
  onEdit,
  allExperiences,
  selectedTargetId,
  onSelectTarget,
  onBackToList,
  hideExperienceLibrary = false,
}: {
  profile: ResumeProfile;
  onEdit: () => void;
  allExperiences: Experience[];
  selectedTargetId: string | null;
  onSelectTarget: (id: string) => void;
  onBackToList: () => void;
  hideExperienceLibrary?: boolean;
}) {
  const targets = profile.resumeTargets ?? [];
  const selectedTarget = targets.find((target) => target.id === selectedTargetId);
  const isEmpty = profile.awards.length === 0 &&
    profile.activities.length === 0 && profile.overseas.length === 0 && targets.length === 0;

  const linkedIds = new Set<string>([
    ...(profile.awards as (ResumeAward & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
    ...(profile.activities as (ResumeActivity & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
    ...(profile.overseas as (ResumeOverseas & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
    ...(profile.selfIntroductions as (ResumeSelfIntro & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
    ...targets.flatMap(target => (target.selfIntroductions as (ResumeSelfIntro & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : [])),
  ]);

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-400">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="6" y="4" width="28" height="32" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 13h14M13 19h14M13 25h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <p className="text-sm">아직 작성된 이력서가 없습니다.</p>
          <button onClick={onEdit}
            className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-xl transition-colors">
            이력서 추가
          </button>
        </div>
        {!hideExperienceLibrary && <ExperienceLibrarySection allExperiences={allExperiences} linkedIds={linkedIds} />}
      </div>
    );
  }

  if (!selectedTarget) {
    return (
      <div className="flex flex-col gap-5">
        <ViewSection title={`기업별 이력서 (${targets.length}건)`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {targets.map((target, targetIndex) => {
              return (
                <button
                  key={target.id}
                  onClick={() => onSelectTarget(target.id)}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/60"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-400">
                      {String(targetIndex + 1).padStart(2, "0")}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{target.companyName || "기업명 미입력"}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {target.jobTitle ? <ViewTag>{target.jobTitle}</ViewTag> : <ViewTag>직무 미입력</ViewTag>}
                    <ViewTag>{target.selfIntroductions.length}문항</ViewTag>
                  </div>
                </button>
              );
            })}
          </div>
        </ViewSection>
        {!hideExperienceLibrary && <ExperienceLibrarySection allExperiences={allExperiences} linkedIds={linkedIds} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={onBackToList}
        className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
      >
        ← 이력서 목록
      </button>

        <ViewSection title="지원 이력서">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold text-slate-900">{selectedTarget.companyName || "기업명 미입력"}</p>
              {selectedTarget.jobTitle && <ViewTag>{selectedTarget.jobTitle}</ViewTag>}
            </div>
            {selectedTarget.jd ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">JD</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selectedTarget.jd}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">채용공고 JD가 입력되지 않았습니다.</p>
            )}
          </div>
        </ViewSection>

        {selectedTarget.selfIntroductions.length > 0 && (
          <ViewSection title={`자기소개서 (${selectedTarget.selfIntroductions.length}문항)`}>
            <div className="flex flex-col gap-2">
              {selectedTarget.selfIntroductions.map((si) => (
                <ExpandableCard
                  key={si.id}
                  title={[
                    selectedTarget.companyName || "기업명 미입력",
                    selectedTarget.jobTitle || "직무 미입력",
                    si.question || "문항 미입력",
                  ].join(" · ")}
                  content={si.answer}
                  defaultOpen
                />
              ))}
            </div>
          </ViewSection>
        )}

      {/* 어학 + 기술 */}
      {(profile.languages.length > 0 || profile.skills.length > 0) && (
        <ViewSection title="어학 / 자격 · 기술">
          {profile.languages.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-400 mb-2">공인외국어시험</p>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((l) => (
                  <div key={l.id} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                    <span className="font-bold text-slate-700">{l.name}</span>
                    <span className="text-slate-400 ml-1.5">{l.score}</span>
                    {l.date && <span className="text-slate-300 ml-1.5">{l.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {profile.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">컴퓨터활용능력</p>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((s) => (
                  <div key={s.id} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                    <span className="font-bold text-slate-700">{s.name}</span>
                    {s.level && <span className="text-slate-400 ml-1.5">{s.level}</span>}
                    {s.period && <span className="text-slate-300 ml-1.5">{s.period}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ViewSection>
      )}

      {/* 수상경력 */}
      {profile.awards.length > 0 && (
        <ViewSection title={`수상경력 (${profile.awards.length}건)`}>
          <div className="flex flex-col gap-2">
            {profile.awards.map((aw) => (
              <ExpandableCard
                key={aw.id}
                title={`${aw.title} — ${aw.organization}`}
                sub={aw.date}
                content={aw.description}
              />
            ))}
          </div>
        </ViewSection>
      )}

      {/* 학내외활동 */}
      {profile.activities.length > 0 && (
        <ViewSection title={`학내외활동 (${profile.activities.length}건)`}>
          <div className="flex flex-col gap-2">
            {profile.activities.map((ac) => (
              <ExpandableCard
                key={ac.id}
                title={`${ac.type} ${ac.organization}`}
                sub={`${ac.startDate}${ac.endDate ? ` ~ ${ac.endDate}` : ""}${ac.role ? ` · ${ac.role}` : ""}`}
                content={ac.description}
              />
            ))}
          </div>
        </ViewSection>
      )}

      {/* 해외경험 */}
      {profile.overseas.length > 0 && (
        <ViewSection title={`해외경험 (${profile.overseas.length}건)`}>
          <div className="flex flex-col gap-2">
            {profile.overseas.map((ov) => (
              <ExpandableCard
                key={ov.id}
                title={`${ov.country} — ${ov.purpose}`}
                sub={`${ov.startDate} ~ ${ov.endDate}`}
                content={ov.description}
              />
            ))}
          </div>
        </ViewSection>
      )}

      {/* 경험 라이브러리 */}
      {!hideExperienceLibrary && <ExperienceLibrarySection allExperiences={allExperiences} linkedIds={linkedIds} />}
    </div>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function ResumeEdit({
  profile,
  update,
  activeTargetId,
  setActiveTargetId,
  hideTargetSelector = false,
}: {
  profile: ResumeProfile;
  update: (patch: Partial<ResumeProfile>) => void;
  activeTargetId: string | null;
  setActiveTargetId: (id: string) => void;
  hideTargetSelector?: boolean;
}) {
  const targets = profile.resumeTargets && profile.resumeTargets.length > 0 ? profile.resumeTargets : [createResumeTarget()];
  const activeTarget = targets.find((target) => target.id === activeTargetId) ?? targets[0];
  const [evaluation, setEvaluation] = useState<{ title: string; result: string; loading: boolean; error: string | null } | null>(null);
  const [jdDragOver, setJdDragOver] = useState(false);
  const [jdImageLoading, setJdImageLoading] = useState(false);
  const [jdImageError, setJdImageError] = useState<string | null>(null);

  const updateTargets = (nextTargets: ResumeTarget[]) => update({ resumeTargets: nextTargets });
  const updateActiveTarget = (patch: Partial<ResumeTarget>) => {
    updateTargets(targets.map((target) => target.id === activeTarget.id ? { ...target, ...patch } : target));
  };
  const addTarget = () => {
    const target = createResumeTarget();
    updateTargets([...targets, target]);
    setActiveTargetId(target.id);
  };
  const removeTarget = (id: string) => {
    const nextTargets = targets.filter((target) => target.id !== id);
    if (nextTargets.length === 0) {
      const replacement = createResumeTarget();
      updateTargets([replacement]);
      setActiveTargetId(replacement.id);
      return;
    }
    updateTargets(nextTargets);
    if (activeTarget.id === id) setActiveTargetId(nextTargets[0].id);
  };

  const handleJdImageFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0 || jdImageLoading) return;

    setJdImageLoading(true);
    setJdImageError(null);
    try {
      const texts = (await Promise.all(imageFiles.map(extractJdTextFromImage))).filter(Boolean);
      if (texts.length === 0) {
        setJdImageError("이미지에서 추출된 텍스트가 없습니다.");
        return;
      }
      updateActiveTarget({
        jd: [activeTarget.jd.trim(), ...texts].filter(Boolean).join("\n\n"),
      });
    } catch (e) {
      setJdImageError(e instanceof Error ? e.message : "이미지 텍스트 추출에 실패했습니다.");
    } finally {
      setJdImageLoading(false);
      setJdDragOver(false);
    }
  };

  const runSelfIntroEvaluation = async (si: ResumeSelfIntro, index: number) => {
    const answer = si.answer.trim();
    const title = `문항 ${index + 1} 글 평가`;
    setEvaluation({ title, result: "", loading: true, error: null });
    if (!answer) {
      setEvaluation({ title, result: "", loading: false, error: "평가할 답변을 먼저 입력해주세요." });
      return;
    }

    const content = [
      activeTarget.companyName ? `기업명: ${activeTarget.companyName}` : "",
      activeTarget.jobTitle ? `직무: ${activeTarget.jobTitle}` : "",
      activeTarget.jd ? `JD:\n${activeTarget.jd}` : "",
      si.question ? `문항: ${si.question}` : "",
      `답변:\n${answer}`,
    ].filter(Boolean).join("\n\n");

    try {
      const { jobId } = await enqueueRecruitAssist("evaluate", content, MODELS[0].id);
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") {
          setEvaluation((prev) => prev ? { ...prev, result: prev.result + event.text } : prev);
        } else if (event.type === "error") {
          setEvaluation((prev) => prev ? { ...prev, loading: false, error: event.message || "글 평가 중 오류가 발생했습니다." } : prev);
        }
      });
      setEvaluation((prev) => prev ? { ...prev, loading: false } : prev);
    } catch (e) {
      setEvaluation((prev) => prev ? { ...prev, loading: false, error: e instanceof Error ? e.message : "글 평가 중 오류가 발생했습니다." } : prev);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 기업별 지원 이력서 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>{hideTargetSelector ? "새 지원 이력서" : "기업별 지원 이력서"}</SectionTitle>
          {!hideTargetSelector && (
            <button onClick={addTarget}
              className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              기업 추가
            </button>
          )}
        </div>

        {!hideTargetSelector && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {targets.map((target, index) => (
              <button
                key={target.id}
                onClick={() => setActiveTargetId(target.id)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                  activeTarget.id === target.id
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span className="block text-[10px] font-black">{String(index + 1).padStart(2, "0")}</span>
                <span className="block max-w-36 truncate text-xs font-bold">{target.companyName || "새 기업"}</span>
                {target.jobTitle && <span className="block max-w-36 truncate text-[10px]">{target.jobTitle}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600">현재 작성 대상</span>
            {targets.length > 1 && <DeleteBtn onClick={() => removeTarget(activeTarget.id)} />}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="기업명" value={activeTarget.companyName} onChange={(v) => updateActiveTarget({ companyName: v })} placeholder="삼성전자 / 카카오" />
            <Field label="직무" value={activeTarget.jobTitle} onChange={(v) => updateActiveTarget({ jobTitle: v })} placeholder="SW 개발 / 데이터 분석" />
            <div className="sm:col-span-2">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setJdDragOver(true);
                }}
                onDragLeave={() => setJdDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  handleJdImageFiles(event.dataTransfer.files);
                }}
                className={`rounded-xl border p-3 transition-colors ${
                  jdDragOver
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">JD (채용공고)</span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600">
                    {jdImageLoading ? (
                      <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 10.5L4.8 7.7C5.15 7.35 5.72 7.35 6.07 7.7L7 8.63L8.93 6.7C9.28 6.35 9.85 6.35 10.2 6.7L11 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="1.5" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                        <circle cx="4.4" cy="4.8" r="0.8" fill="currentColor" />
                      </svg>
                    )}
                    이미지에서 추출
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        if (event.target.files) handleJdImageFiles(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                <textarea
                  value={activeTarget.jd}
                  onChange={(event) => updateActiveTarget({ jd: event.target.value })}
                  placeholder="지원할 채용공고 내용을 붙여넣거나, 채용공고 이미지를 이 영역에 끌어다 놓으세요."
                  rows={7}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none transition-colors focus:border-indigo-300"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">
                    이미지 파일을 끌어다 놓으면 JD 텍스트로 추출해서 아래 내용에 추가합니다.
                  </p>
                  {jdImageError && <p className="text-xs font-semibold text-red-500">{jdImageError}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 어학 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>어학</SectionTitle>
          <button onClick={() => update({ languages: [...profile.languages, { id: uid(), name: "", score: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.languages.length === 0 && <EmptyHint>어학 성적을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-3">
          {profile.languages.map((lang, i) => (
            <div key={lang.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ languages: profile.languages.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="시험명" value={lang.name} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], name: v }; update({ languages: ls }); }} placeholder="OPIc(영어) / TOEIC" />
                <Field label="점수/등급" value={lang.score} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], score: v }; update({ languages: ls }); }} placeholder="Advanced Low / 900" />
                <Field label="응시일" value={lang.date ?? ""} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], date: v }; update({ languages: ls }); }} placeholder="2025.05" />
                <Field label="등록번호" value={lang.regNo ?? ""} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], regNo: v }; update({ languages: ls }); }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 기술 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>자격 / 기술</SectionTitle>
          <button onClick={() => update({ skills: [...profile.skills, { id: uid(), category: "컴퓨터활용능력", name: "", level: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.skills.length === 0 && <EmptyHint>자격 및 기술을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-2">
          {profile.skills.map((sk, i) => (
            <div key={sk.id} className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="이름" value={sk.name} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], name: v }; update({ skills: ss }); }} placeholder="C언어" />
                <Field label="수준" value={sk.level ?? ""} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], level: v }; update({ skills: ss }); }} placeholder="중급" />
                <Field label="분류" value={sk.category} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], category: v }; update({ skills: ss }); }} placeholder="컴퓨터활용능력" />
                <Field label="사용기간" value={sk.period ?? ""} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], period: v }; update({ skills: ss }); }} placeholder="4년" />
              </div>
              <DeleteBtn onClick={() => update({ skills: profile.skills.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
      </section>

      {/* 수상경력 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>수상경력</SectionTitle>
          <button onClick={() => update({ awards: [...profile.awards, { id: uid(), title: "", organization: "", date: "", description: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.awards.length === 0 && <EmptyHint>수상경력을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.awards.map((aw, i) => (
            <div key={aw.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ awards: profile.awards.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="상훈명" value={aw.title} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], title: v }; update({ awards: as2 }); }} placeholder="최우수 / 대상" />
                <Field label="수여기관" value={aw.organization} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], organization: v }; update({ awards: as2 }); }} />
                <Field label="발급일" value={aw.date} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], date: v }; update({ awards: as2 }); }} placeholder="2023.12.14" />
              </div>
              <Field label="상세 내용 (경험 라이브러리에 저장됩니다)" value={aw.description ?? ""} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], description: v }; update({ awards: as2 }); }} placeholder="수상 배경과 성과를 자세히 기술하세요." multiline />
            </div>
          ))}
        </div>
      </section>

      {/* 학내외활동 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>학내외활동</SectionTitle>
          <button onClick={() => update({ activities: [...profile.activities, { id: uid(), type: "연구회", organization: "", startDate: "", endDate: "", role: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.activities.length === 0 && <EmptyHint>학내외활동을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.activities.map((ac, i) => (
            <div key={ac.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ activities: profile.activities.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="활동구분" value={ac.type} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], type: v }; update({ activities: aas }); }} placeholder="연구회 / 동아리" />
                <Field label="기관/조직명" value={ac.organization} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], organization: v }; update({ activities: aas }); }} />
                <Field label="시작일" value={ac.startDate} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], startDate: v }; update({ activities: aas }); }} placeholder="2020.12" />
                <Field label="종료일" value={ac.endDate ?? ""} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], endDate: v }; update({ activities: aas }); }} placeholder="2022.05" />
                <Field label="역할" value={ac.role ?? ""} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], role: v }; update({ activities: aas }); }} placeholder="임원 / 팀장" />
              </div>
              <Field label="활동 내용 (경험 라이브러리에 저장됩니다)" value={ac.description ?? ""} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], description: v }; update({ activities: aas }); }} placeholder="활동 내용을 자세히 기술하세요." multiline />
            </div>
          ))}
        </div>
      </section>

      {/* 해외경험 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>해외경험</SectionTitle>
          <button onClick={() => update({ overseas: [...profile.overseas, { id: uid(), country: "", purpose: "해외거주", startDate: "", endDate: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.overseas.length === 0 && <EmptyHint>해외경험을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.overseas.map((ov, i) => (
            <div key={ov.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ overseas: profile.overseas.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="국가" value={ov.country} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], country: v }; update({ overseas: os }); }} placeholder="파나마 / 아랍에미리트" />
                <Field label="목적" value={ov.purpose} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], purpose: v }; update({ overseas: os }); }} placeholder="해외거주 / 어학연수" />
                <Field label="시작일" value={ov.startDate} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], startDate: v }; update({ overseas: os }); }} placeholder="2013.12.18" />
                <Field label="종료일" value={ov.endDate} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], endDate: v }; update({ overseas: os }); }} placeholder="2016.06.20" />
              </div>
              <Field label="상세 내용 (경험 라이브러리에 저장됩니다)" value={ov.description ?? ""} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], description: v }; update({ overseas: os }); }} placeholder="해외경험 내용을 자세히 기술하세요." multiline />
            </div>
          ))}
        </div>
      </section>

      {/* 자기소개서 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>자기소개서 · {activeTarget.companyName || "새 기업"}</SectionTitle>
          <button onClick={() => updateActiveTarget({ selfIntroductions: [...activeTarget.selfIntroductions, { id: uid(), question: "", answer: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {activeTarget.selfIntroductions.length === 0 && <EmptyHint>현재 기업의 자기소개서 문항을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {activeTarget.selfIntroductions.map((si, i) => (
            <div key={si.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-600">문항 {i + 1}</span>
                <DeleteBtn onClick={() => updateActiveTarget({ selfIntroductions: activeTarget.selfIntroductions.filter((_, j) => j !== i) })} />
              </div>
              <Field label="질문" value={si.question} onChange={(v) => {
                const ss = [...activeTarget.selfIntroductions];
                ss[i] = { ...ss[i], question: v };
                updateActiveTarget({ selfIntroductions: ss });
              }} placeholder="성장과정 및 인생에서 가장 가치를 두는 것은?" />
              <Field label="답변 (경험 라이브러리에 저장됩니다)" value={si.answer} onChange={(v) => {
                const ss = [...activeTarget.selfIntroductions];
                ss[i] = { ...ss[i], answer: v };
                updateActiveTarget({ selfIntroductions: ss });
              }} placeholder="자세한 내용을 작성하세요." multiline />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-400">
                  공백 포함 {si.answer.length.toLocaleString()}자 · 공백 제외 {si.answer.replace(/\s/g, "").length.toLocaleString()}자
                </span>
                <button
                  onClick={() => runSelfIntroEvaluation(si, i)}
                  disabled={!si.answer.trim() || evaluation?.loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <IconEvaluate />
                  글 평가
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {evaluation && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => !evaluation.loading && setEvaluation(null)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <IconEvaluate />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{evaluation.title}</h3>
                  <p className="text-xs text-slate-400">{evaluation.loading ? "AI가 답변을 평가하고 있습니다." : "평가 결과를 확인하세요."}</p>
                </div>
              </div>
              <button
                onClick={() => setEvaluation(null)}
                disabled={evaluation.loading}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                닫기
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {evaluation.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{evaluation.error}</div>
              ) : !evaluation.result && evaluation.loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">평가 결과를 불러오는 중...</div>
              ) : (
                <div className={`${PROSE_CLASS} rounded-xl bg-slate-50 p-4`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{evaluation.result || "결과가 없습니다."}</ReactMarkdown>
                  {evaluation.loading && <span className="inline-block h-4 w-1 animate-pulse rounded bg-indigo-500" />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Experience sync ───────────────────────────────────────────────────────────

type SyncableItem = (ResumeAward | ResumeActivity | ResumeOverseas | ResumeSelfIntro) & { experienceId?: string };

function selfIntroExperienceTitle(si: ResumeSelfIntro) {
  const title = [si.companyName?.trim(), si.jobTitle?.trim(), si.question?.trim()].filter(Boolean).join(" · ");
  return title || "자기소개서";
}

function selfIntroExperienceContent(si: ResumeSelfIntro) {
  return si.answer?.trim() ?? "";
}

function targetSelfIntro(target: ResumeTarget, si: ResumeSelfIntro): ResumeSelfIntro {
  return {
    ...si,
    companyName: si.companyName || target.companyName,
    jobTitle: si.jobTitle || target.jobTitle,
    jd: si.jd || target.jd,
  };
}

async function syncToExperienceLibrary(profile: ResumeProfile): Promise<ResumeProfile> {
  const updated = structuredClone(profile) as ResumeProfile & {
    awards: (ResumeAward & { experienceId?: string })[];
    activities: (ResumeActivity & { experienceId?: string })[];
    overseas: (ResumeOverseas & { experienceId?: string })[];
    selfIntroductions: (ResumeSelfIntro & { experienceId?: string })[];
    resumeTargets?: (ResumeTarget & { selfIntroductions: (ResumeSelfIntro & { experienceId?: string })[] })[];
  };

  const syncItems = async <T extends SyncableItem>(
    items: T[],
    getTitle: (item: T) => string,
    getContent: (item: T) => string,
    category: string,
  ) => {
    for (const item of items) {
      const content = getContent(item).trim();
      if (!content) continue;
      const expData = { title: getTitle(item), content, category };
      try {
        if ((item as SyncableItem).experienceId) {
          await updateExperience((item as SyncableItem).experienceId!, expData);
        } else {
          const exp = await createExperience(expData);
          (item as SyncableItem).experienceId = exp.id;
        }
      } catch { /* 개별 실패는 무시 */ }
    }
  };

  await syncItems(
    updated.awards,
    (aw) => `${aw.title} — ${aw.organization}`,
    (aw) => aw.description ?? "",
    "수상경력",
  );
  await syncItems(
    updated.activities,
    (ac) => `${ac.type} ${ac.organization}`,
    (ac) => ac.description ?? "",
    "학내외활동",
  );
  await syncItems(
    updated.overseas,
    (ov) => `${ov.country} (${ov.purpose})`,
    (ov) => ov.description ?? "",
    "해외경험",
  );
  if (updated.resumeTargets && updated.resumeTargets.length > 0) {
    for (const target of updated.resumeTargets) {
      await syncItems(
        target.selfIntroductions,
        (si) => selfIntroExperienceTitle(targetSelfIntro(target, si)),
        (si) => selfIntroExperienceContent(targetSelfIntro(target, si)),
        "자기소개서",
      );
    }
    updated.selfIntroductions = updated.resumeTargets.flatMap((target) =>
      target.selfIntroductions.map((si) => targetSelfIntro(target, si)),
    );
  } else {
    await syncItems(
      updated.selfIntroductions,
      selfIntroExperienceTitle,
      selfIntroExperienceContent,
      "자기소개서",
    );
  }

  return updated as ResumeProfile;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ResumeMode = "view" | "edit";

function parseResumeQueryId(raw: string | null): { id: string | null; edit: boolean } {
  if (!raw) return { id: null, edit: false };
  if (raw.endsWith("/edit")) return { id: raw.slice(0, -"/edit".length), edit: true };
  return { id: raw, edit: false };
}

export function ResumePageContent({ initialMode = "view", createNewOnLoad = false }: { initialMode?: ResumeMode; createNewOnLoad?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ResumeProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<ResumeMode>(initialMode);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    Promise.all([
      getResume().catch(() => null),
      getExperiences().catch(() => [] as Experience[]),
    ]).then(([res, exps]) => {
      let normalized = normalizeResumeProfile(res ?? EMPTY_PROFILE);
      if (createNewOnLoad) {
        const target = createResumeTarget();
        normalized = { ...normalized, resumeTargets: [...(normalized.resumeTargets ?? []), target] };
        setActiveTargetId(target.id);
      } else {
        setActiveTargetId(normalized.resumeTargets?.[0]?.id ?? null);
      }
      const query = parseResumeQueryId(searchParams.get("id"));
      const validQueryId = query.id && normalized.resumeTargets?.some((target) => target.id === query.id) ? query.id : null;
      setViewTargetId(validQueryId);
      if (validQueryId) setActiveTargetId(validQueryId);
      setMode(validQueryId && query.edit ? "edit" : initialMode);
      setProfile(normalized);
      setExperiences(exps);
      setLoading(false);
    });
  }, [createNewOnLoad, initialMode, searchParams]);

  useEffect(() => {
    if (loading) return;
    const query = parseResumeQueryId(searchParams.get("id"));
    const validQueryId = query.id && profile.resumeTargets?.some((target) => target.id === query.id) ? query.id : null;
    setViewTargetId(validQueryId);
    if (validQueryId) setActiveTargetId(validQueryId);
    setMode(validQueryId && query.edit ? "edit" : initialMode);
  }, [initialMode, loading, profile.resumeTargets, searchParams]);

  const update = useCallback((patch: Partial<ResumeProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const synced = await syncToExperienceLibrary(profile);
      setProfile(synced);
      await saveResume(synced);
      getExperiences().then(setExperiences).catch(() => {});
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2500);
      if (viewTargetId) {
        setMode("view");
        router.push(`/recruit/resume?id=${viewTargetId}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const goView = () => {
    setMode("view");
    router.push("/recruit/resume");
  };

  const goEdit = () => {
    router.push("/recruit/resume/write");
  };

  const addResume = () => {
    router.push("/recruit/resume/write?new=1");
  };

  const selectResume = (id: string) => {
    setViewTargetId(id);
    setActiveTargetId(id);
    router.push(`/recruit/resume?id=${encodeURIComponent(id)}`);
  };

  const editResume = (id: string) => {
    setViewTargetId(id);
    setActiveTargetId(id);
    setMode("edit");
    router.push(`/recruit/resume?id=${id}/edit`);
  };

  const backToResumeList = () => {
    setDeleteConfirm(false);
    setViewTargetId(null);
    setMode("view");
    router.push("/recruit/resume");
  };

  const handleDeleteTarget = async () => {
    if (!viewTargetId) return;
    const nextTargets = (profile.resumeTargets ?? []).filter((t) => t.id !== viewTargetId);
    const nextProfile = { ...profile, resumeTargets: nextTargets };
    setProfile(nextProfile);
    await saveResume(nextProfile).catch(() => {});
    backToResumeList();
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200/60 flex items-center gap-3 px-5 py-3">
        <button onClick={() => router.push("/recruit")} className="text-slate-400 hover:text-slate-700 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-sm font-bold text-slate-800">이력서</h1>
        <div className="flex-1" />
        {mode === "edit" && (
          <button onClick={handleSave} disabled={saving}
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saved ? "저장됨 ✓" : saving ? "저장 중..." : "저장"}
          </button>
        )}
        {mode === "view" && viewTargetId && (
          <div className="flex items-center gap-2">
            {deleteConfirm ? (
              <>
                <span className="text-xs text-slate-500">정말 삭제할까요?</span>
                <button
                  onClick={handleDeleteTarget}
                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors"
                >
                  확인
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  취소
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  삭제
                </button>
                <button
                  onClick={() => editResume(viewTargetId)}
                  className="text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  편집
                </button>
              </>
            )}
          </div>
        )}
        {mode === "view" && !viewTargetId && (
          <button onClick={addResume}
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors">
            이력서 추가
          </button>
        )}
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {mode === "view" ? (
          <ResumeView
            profile={profile}
            onEdit={goEdit}
            allExperiences={experiences}
            selectedTargetId={viewTargetId}
            onSelectTarget={selectResume}
            onBackToList={backToResumeList}
            hideExperienceLibrary={Boolean(viewTargetId)}
          />
        ) : (
          <>
            {viewTargetId && (
              <button
                onClick={() => {
                  setMode("view");
                  if (viewTargetId) router.push(`/recruit/resume?id=${viewTargetId}`);
                }}
                className="mb-4 w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                ← 보기로 돌아가기
              </button>
            )}
            <ResumeEdit
              profile={profile}
              update={update}
              activeTargetId={activeTargetId}
              setActiveTargetId={setActiveTargetId}
              hideTargetSelector={Boolean(viewTargetId) || createNewOnLoad}
            />
            <div className="flex justify-end py-6">
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2">
                {saving && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {saved ? "저장됨 ✓" : saving ? "저장 중..." : "이력서 저장"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResumePage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>}>
      <ResumePageContent initialMode="view" />
    </Suspense>
  );
}
