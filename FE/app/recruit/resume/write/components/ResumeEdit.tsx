"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  type ResumeExperience,
  type ResumePrize,
  type ResumeProfile,
  type ResumeSelfIntro,
  type ResumeTarget,
} from "@/lib/api/resume";
import { API_BASE, getAuthHeaders } from "@/lib/api/base";
import { IconEvaluate } from "../../../_components/icons";
import { MODELS } from "../../../_constants";

function uid() {
  return Math.random().toString(36).slice(2);
}

function createResumeTarget(): ResumeTarget {
  return {
    id: uid(),
    companyName: "",
    jobTitle: "",
    appliedAt: "",
    jd: "",
    selfIntroductions: [],
    experiences: [],
    prizes: [],
  };
}

function createResumeExperience(activityType = ""): ResumeExperience {
  return {
    id: uid(),
    activityType,
    organizationName: "",
    startDate: "",
    endDate: "",
    role: "",
    description: "",
  };
}

function createResumePrize(): ResumePrize {
  return {
    id: uid(),
    title: "",
    organization: "",
    issuedDate: "",
    description: "",
  };
}

async function extractJdTextFromImage(file: File, model: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);

  const enqueueRes = await fetch(`${API_BASE}/queue/image-ocr/enqueue`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  const enqueueRaw = await enqueueRes.json().catch(() => ({}));
  const enqueueData = enqueueRaw?.isSuccess === true && "result" in enqueueRaw ? enqueueRaw.result : enqueueRaw;
  if (!enqueueRes.ok) {
    throw new Error(typeof enqueueData?.message === "string" ? enqueueData.message : "이미지 OCR 요청에 실패했습니다.");
  }
  const { jobId } = enqueueData as { jobId: string };

  return new Promise<string>((resolve, reject) => {
    const headers = getAuthHeaders() as Record<string, string>;
    const ctrl = new AbortController();
    let fullText = "";

    fetch(`${API_BASE}/queue/image-ocr/${jobId}/stream`, { headers, signal: ctrl.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) throw new Error("SSE 연결 실패");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const event = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; message?: string };
              if (event.type === "chunk" && event.text) {
                fullText += event.text;
              } else if (event.type === "done") {
                ctrl.abort();
                resolve(fullText.trim());
                return;
              } else if (event.type === "error") {
                ctrl.abort();
                reject(new Error(event.message ?? "OCR 오류"));
                return;
              }
            } catch {
              // Ignore malformed SSE chunks.
            }
          }
        }
        resolve(fullText.trim());
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") reject(error);
      });
  });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.12em] text-slate-400">{children}</h2>;
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
  );
}

function Field({ label, value, onChange, placeholder, multiline, rows }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {

  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs px-2 font-bold text-slate-500">{label}</span>
      {multiline ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 5}
          className="resize-y rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-relaxed text-slate-800 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      )}
    </div>
  );
}

function DateField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  );
}

export default function ResumeEdit({
  profile,
  update,
  activeTargetId,
  setActiveTargetId,
  hideTargetSelector = false,
  model,
  onEvaluate,
  onSpellcheck,
}: {
  profile: ResumeProfile;
  update: (patch: Partial<ResumeProfile>) => void;
  activeTargetId: string | null;
  setActiveTargetId: (id: string) => void;
  hideTargetSelector?: boolean;
  model?: string;
  onEvaluate?: (si: ResumeSelfIntro, index: number) => void;
  onSpellcheck?: (si: ResumeSelfIntro, index: number) => void;
}) {
  const targets = profile.resumeTargets && profile.resumeTargets.length > 0 ? profile.resumeTargets : [createResumeTarget()];
  const activeTarget = targets.find((target) => target.id === activeTargetId) ?? targets[0];
  const [jdDragOver, setJdDragOver] = useState(false);
  const [jdImageLoading, setJdImageLoading] = useState(false);
  const [jdImageError, setJdImageError] = useState<string | null>(null);
  const [jdOcrModel, setJdOcrModel] = useState(MODELS[0].id);

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
  const activeExperiences = activeTarget.experiences ?? [];
  const activePrizes = activeTarget.prizes ?? [];
  const updateExperienceAt = (index: number, patch: Partial<ResumeExperience>) => {
    const experiences = [...activeExperiences];
    experiences[index] = { ...experiences[index], ...patch };
    updateActiveTarget({ experiences });
  };
  const removeExperienceAt = (index: number) => {
    updateActiveTarget({ experiences: activeExperiences.filter((_, i) => i !== index) });
  };
  const addExperience = (activityType = "") => {
    updateActiveTarget({ experiences: [...activeExperiences, createResumeExperience(activityType)] });
  };
  const updatePrizeAt = (index: number, patch: Partial<ResumePrize>) => {
    const prizes = [...activePrizes];
    prizes[index] = { ...prizes[index], ...patch };
    updateActiveTarget({ prizes });
  };
  const removePrizeAt = (index: number) => {
    updateActiveTarget({ prizes: activePrizes.filter((_, i) => i !== index) });
  };
  const addPrize = () => {
    updateActiveTarget({ prizes: [...activePrizes, createResumePrize()] });
  };

  const handleJdImageFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0 || jdImageLoading) return;

    setJdImageLoading(true);
    setJdImageError(null);
    try {
      const texts = (await Promise.all(imageFiles.map((f) => extractJdTextFromImage(f, jdOcrModel)))).filter(Boolean);
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

  return (
    <div className="flex flex-col gap-0">
      {/* 기업별 지원 이력서 */}
      <section className="pb-6">
        <div className="flex items-center justify-between mb-4">
          {!hideTargetSelector && (
            <button onClick={addTarget}
              className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              기업 추가
            </button>
          )}
        </div>

        {!hideTargetSelector && (
          <div className="mb-5 flex gap-0 overflow-x-auto border-b border-slate-100">
            {targets.map((target, index) => (
              <button
                key={target.id}
                onClick={() => setActiveTargetId(target.id)}
                className={`shrink-0 border-b-2 -mb-px px-3 pb-3 pt-1 text-left transition-colors ${activeTarget.id === target.id
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
              >
                <span className="block text-2xs font-black tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span className="block max-w-36 truncate text-xs font-bold">{target.companyName || "새 기업"}</span>
                {target.jobTitle && <span className="block max-w-36 truncate text-2xs text-slate-400">{target.jobTitle}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="pt-2">
          <div className="mb-4 flex items-center justify-between">
            {targets.length > 1 && <DeleteBtn onClick={() => removeTarget(activeTarget.id)} />}
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-6">
            <Field label="기업명" value={activeTarget.companyName} onChange={(v) => updateActiveTarget({ companyName: v })} placeholder="삼성전자 / 카카오" />
            <Field label="직무" value={activeTarget.jobTitle} onChange={(v) => updateActiveTarget({ jobTitle: v })} placeholder="SW 개발 / 데이터 분석" />
            <DateField label="지원일자" value={activeTarget.appliedAt ?? ""} onChange={(v) => updateActiveTarget({ appliedAt: v })} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="sm:col-span-1">
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
                className={`rounded-xl border p-3 transition-colors ${jdDragOver
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-slate-200 bg-slate-50"
                  }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">JD (채용공고)</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={jdOcrModel}
                      onChange={(e) => setJdOcrModel(e.target.value)}
                      className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 outline-none"
                      title="OCR 모델"
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
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
                </div>
                <textarea
                  value={activeTarget.jd}
                  onChange={(event) => updateActiveTarget({ jd: event.target.value })}
                  placeholder="지원할 채용공고 내용을 붙여넣거나, 채용공고 이미지를 이 영역에 끌어다 놓으세요."
                  rows={7}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
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

      {/* 경험 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>경험</SectionTitle>
          <button onClick={() => addExperience()}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            추가
          </button>
        </div>
        {activeExperiences.filter((exp) => exp.activityType !== "해외 경험").length === 0 && <EmptyHint>프로젝트, 대외활동, 인턴, 봉사 등 주요 경험을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-5">
          {activeExperiences.map((exp, index) => {
            if (exp.activityType === "해외 경험") return null;
            return (
              <div key={exp.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">경험 {index + 1}</span>
                  <DeleteBtn onClick={() => removeExperienceAt(index)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="활동구분" value={exp.activityType} onChange={(v) => updateExperienceAt(index, { activityType: v })} placeholder="프로젝트 / 인턴 / 대외활동" />
                  <Field label="기관/조직명" value={exp.organizationName} onChange={(v) => updateExperienceAt(index, { organizationName: v })} placeholder="기관 또는 조직명" />
                  <DateField label="시작일" value={exp.startDate ?? ""} onChange={(v) => updateExperienceAt(index, { startDate: v })} />
                  <DateField label="종료일" value={exp.endDate ?? ""} onChange={(v) => updateExperienceAt(index, { endDate: v })} />
                  <Field label="역할" value={exp.role ?? ""} onChange={(v) => updateExperienceAt(index, { role: v })} placeholder="기획 / 개발 / 리더" />
                  <div />
                  <div className="sm:col-span-2">
                    <Field label="활동 내용" value={exp.description ?? ""} onChange={(v) => updateExperienceAt(index, { description: v })} placeholder="맡은 역할, 문제 해결 과정, 성과를 적어주세요." multiline rows={3} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 수상 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>수상</SectionTitle>
          <button onClick={addPrize}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            추가
          </button>
        </div>
        {activePrizes.length === 0 && <EmptyHint>공모전, 대회, 장학, 표창 등 수상 내역을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-5">
          {activePrizes.map((prize, index) => (
            <div key={prize.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">수상 {index + 1}</span>
                <DeleteBtn onClick={() => removePrizeAt(index)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="상훈명" value={prize.title} onChange={(v) => updatePrizeAt(index, { title: v })} placeholder="공모전 대상 / 우수상" />
                <Field label="수여기관" value={prize.organization} onChange={(v) => updatePrizeAt(index, { organization: v })} placeholder="수여기관" />
                <DateField label="발급일" value={prize.issuedDate ?? ""} onChange={(v) => updatePrizeAt(index, { issuedDate: v })} />
                <div />
                <div className="sm:col-span-2">
                  <Field label="상세 내용" value={prize.description ?? ""} onChange={(v) => updatePrizeAt(index, { description: v })} placeholder="수상 배경, 기여도, 결과를 적어주세요." multiline rows={3} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 해외 경험 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>해외 경험</SectionTitle>
          <button onClick={() => addExperience("해외 경험")}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            추가
          </button>
        </div>
        {activeExperiences.filter((exp) => exp.activityType === "해외 경험").length === 0 && <EmptyHint>해외연수, 교환학생, 글로벌 프로젝트 등 해외 경험을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-5">
          {activeExperiences.map((exp, index) => {
            if (exp.activityType !== "해외 경험") return null;
            return (
              <div key={exp.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">해외 경험 {index + 1}</span>
                  <DeleteBtn onClick={() => removeExperienceAt(index)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="기관/프로그램명" value={exp.organizationName} onChange={(v) => updateExperienceAt(index, { organizationName: v })} placeholder="교환학생 / 해외연수 / 글로벌 프로젝트" />
                  <Field label="역할/목적" value={exp.role ?? ""} onChange={(v) => updateExperienceAt(index, { role: v })} placeholder="연수 / 연구 / 프로젝트 참여" />
                  <DateField label="시작일" value={exp.startDate ?? ""} onChange={(v) => updateExperienceAt(index, { startDate: v })} />
                  <DateField label="종료일" value={exp.endDate ?? ""} onChange={(v) => updateExperienceAt(index, { endDate: v })} />
                  <div className="sm:col-span-2">
                    <Field label="상세 내용" value={exp.description ?? ""} onChange={(v) => updateExperienceAt(index, { description: v })} placeholder="국가, 수행 내용, 배운 점, 성과를 적어주세요." multiline rows={3} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 자기소개서 */}
      <section className="border-t border-slate-200 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>자기소개서</SectionTitle>
          <button onClick={() => updateActiveTarget({ selfIntroductions: [...activeTarget.selfIntroductions, { id: uid(), question: "", answer: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {activeTarget.selfIntroductions.length === 0 && <EmptyHint>현재 기업의 자기소개서 문항을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-6">
          {activeTarget.selfIntroductions.map((si, i) => (
            <div key={si.id} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800">문항 {i + 1}</span>
                  {si.category && si.category.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {si.category.map((category) => (
                        <span key={category} className="inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <DeleteBtn onClick={() => updateActiveTarget({ selfIntroductions: activeTarget.selfIntroductions.filter((_, j) => j !== i) })} />
              </div>
              <Field label="질문" value={si.question} onChange={(v) => {
                const ss = [...activeTarget.selfIntroductions];
                ss[i] = { ...ss[i], question: v };
                updateActiveTarget({ selfIntroductions: ss });
              }} placeholder="성장과정 및 인생에서 가장 가치를 두는 것은?" multiline rows={1} />
              <Field label="답변 (경험 라이브러리에 저장됩니다)" value={si.answer} onChange={(v) => {
                const ss = [...activeTarget.selfIntroductions];
                ss[i] = { ...ss[i], answer: v };
                updateActiveTarget({ selfIntroductions: ss });
              }} placeholder="자세한 내용을 작성하세요." multiline rows={8} />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-1">
                <span className="text-xs font-semibold text-slate-400">
                  공백 포함 {si.answer.length.toLocaleString()}자 · 공백 제외 {si.answer.replace(/\s/g, "").length.toLocaleString()}자
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSpellcheck?.(si, i)}
                    disabled={!si.answer.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    맞춤법
                  </button>
                  <button
                    onClick={() => onEvaluate?.(si, i)}
                    disabled={!si.answer.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <IconEvaluate />
                    글 평가
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
