"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  enqueueResumeCoverLetterCategories,
  enqueueResumeCoverLetterRefinedTitles,
  getResume,
  saveResume,
  streamResumeCoverLetterCategories,
  streamResumeCoverLetterRefinedTitles,
  type ResumeExperience,
  type ResumePrize,
  type ResumeProfile,
  type ResumeSelfIntro,
  type ResumeTarget,
} from "@/lib/api/resume";
import ResumeEdit from "./components/ResumeEdit";
import { useAuth } from "@/contexts/AuthContext";
import { MODELS } from "@/recruit/_constants";
import ResumeSidebar, { type ResumeSidebarRef } from "../components/ResumeSidebar";

function uid() {
  return Math.random().toString(36).slice(2);
}


// ─── Self-intro diff utilities ─────────────────────────────────────────────
// Maps siId → "question\0answer" fingerprint for O(1) lookup
type SelfIntroSnapshot = Map<string, string>;

function snapshotSelfIntros(selfIntros: ResumeSelfIntro[]): SelfIntroSnapshot {
  return new Map(selfIntros.map((si) => [si.id, `${si.question}\x00${si.answer}`]));
}

// Returns IDs of self-intros that changed AND have non-empty content (AI 처리 대상)
function diffSelfIntros(saved: SelfIntroSnapshot, current: ResumeSelfIntro[]): string[] {
  return current
    .filter((si) => {
      const fp = `${si.question}\x00${si.answer}`;
      return saved.get(si.id) !== fp && (si.question.trim() || si.answer.trim());
    })
    .map((si) => si.id);
}
// ──────────────────────────────────────────────────────────────────────────

function createResumeTarget(): ResumeTarget {
  return { id: uid(), companyName: "", jobTitle: "", appliedAt: "", jd: "", selfIntroductions: [] };
}

function normalizeResumeProfile(profile: ResumeProfile | null): ResumeProfile {
  if (profile?.resumeTargets?.length) return profile;
  return { resumeTargets: [createResumeTarget()] };
}

function WritePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const editId = searchParams.get("id");

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [categoryStatus, setCategoryStatus] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const modelInitRef = useRef(false);

  useEffect(() => {
    if (!modelInitRef.current && user?.defaultCloudModel) {
      setModel(user.defaultCloudModel);
      modelInitRef.current = true;
    }
  }, [user]);
  const [profile, setProfile] = useState<ResumeProfile>({ resumeTargets: [] });
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // targetId → SelfIntroSnapshot (마지막 저장 시점의 자기소개서 지문)
  const savedSnapshotsRef = useRef<Map<string, SelfIntroSnapshot>>(new Map());
  const sidebarRef = useRef<ResumeSidebarRef>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (isNew) {
          const target = createResumeTarget();
          const loaded = await getResume().catch(() => null);
          const existingTargets = loaded?.resumeTargets ?? [];
          if (!cancelled) {
            setProfile({ resumeTargets: [...existingTargets, target] });
            setActiveTargetId(target.id);
            // 신규 타겟: 저장된 자기소개서 없음
            savedSnapshotsRef.current.set(target.id, new Map());
          }
          return;
        }

        const loaded = normalizeResumeProfile(await getResume());
        const selected = editId
          ? loaded.resumeTargets.find((target) => target.id === editId) ?? loaded.resumeTargets[0]
          : loaded.resumeTargets[0];

        if (!cancelled) {
          setProfile(loaded);
          setActiveTargetId(selected?.id ?? null);
          // 로드 시점을 "마지막 저장 상태"로 기록
          for (const t of loaded.resumeTargets) {
            savedSnapshotsRef.current.set(t.id, snapshotSelfIntros(t.selfIntroductions));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editId, isNew]);

  const update = useCallback((patch: Partial<ResumeProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const insertSelfIntro = useCallback((si: ResumeSelfIntro) => {
    setProfile((prev) => ({
      ...prev,
      resumeTargets: prev.resumeTargets.map((t) =>
        t.id === activeTargetId
          ? { ...t, selfIntroductions: [...t.selfIntroductions, si] }
          : t,
      ),
    }));
  }, [activeTargetId]);

  const insertExperience = useCallback((exp: ResumeExperience) => {
    setProfile((prev) => ({
      ...prev,
      resumeTargets: prev.resumeTargets.map((t) =>
        t.id === activeTargetId
          ? { ...t, experiences: [...(t.experiences ?? []), exp] }
          : t,
      ),
    }));
  }, [activeTargetId]);

  const insertPrize = useCallback((prize: ResumePrize) => {
    setProfile((prev) => ({
      ...prev,
      resumeTargets: prev.resumeTargets.map((t) =>
        t.id === activeTargetId
          ? { ...t, prizes: [...(t.prizes ?? []), prize] }
          : t,
      ),
    }));
  }, [activeTargetId]);

  const handleEvaluate = useCallback((si: ResumeSelfIntro, index: number) => {
    const target = profile.resumeTargets.find((t) => t.id === activeTargetId) ?? profile.resumeTargets[0];
    const title = si.question
      ? `문항 ${index + 1}: ${si.question.slice(0, 30)}${si.question.length > 30 ? "…" : ""}`
      : `문항 ${index + 1}`;
    const content = [
      target?.companyName ? `기업명: ${target.companyName}` : "",
      target?.jobTitle ? `직무: ${target.jobTitle}` : "",
      target?.jd ? `JD:\n${target.jd}` : "",
      si.question ? `문항: ${si.question}` : "",
      `답변:\n${si.answer}`,
    ].filter(Boolean).join("\n\n");
    sidebarRef.current?.startEval(si.id, title, content, model);
  }, [activeTargetId, model, profile.resumeTargets]);

  const handleSpellcheck = useCallback((si: ResumeSelfIntro, index: number) => {
    const title = `문항 ${index + 1} 맞춤법 검사`;
    sidebarRef.current?.startEval(si.id, title, si.answer, model, "spellcheck");
  }, [model]);

  const handleSave = async () => {
    setSaving(true);
    setCategoryStatus("");
    try {
      const savedProfile = await saveResume(profile, { replaceAll: !isNew });
      setProfile(savedProfile);
      const nextId = activeTargetId ?? savedProfile.resumeTargets[0]?.id;
      if (nextId) {
        const currentTarget = profile.resumeTargets.find((item) => item.id === nextId);
        const selfIntros = currentTarget?.selfIntroductions ?? [];

        // diff: 마지막 저장 이후 변경된 자기소개서 항목만 AI 처리
        const savedSnap = savedSnapshotsRef.current.get(nextId) ?? new Map<string, string>();
        const changedIds = diffSelfIntros(savedSnap, selfIntros);

        if (changedIds.length > 0) {
          setCategoryStatus("자기소개서 카테고리 분류 중...");
          try {
            const { jobId } = await enqueueResumeCoverLetterCategories({
              coverLetterIds: changedIds,
              model,
            });
            await streamResumeCoverLetterCategories(jobId, (event) => {
              if (event.type === "log") setCategoryStatus(event.message);
              if (event.type === "error") setCategoryStatus(event.message);
            });
          } catch (error) {
            setCategoryStatus(error instanceof Error ? error.message : "카테고리 분류에 실패했습니다.");
          }
          setCategoryStatus("자기소개서 제목 재작성 중...");
          try {
            const { jobId } = await enqueueResumeCoverLetterRefinedTitles({
              coverLetterIds: changedIds,
              model,
            });
            await streamResumeCoverLetterRefinedTitles(jobId, (event) => {
              if (event.type === "log") setCategoryStatus(event.message);
              if (event.type === "error") setCategoryStatus(event.message);
            });
          } catch {
            // 제목 재작성 실패는 무시하고 계속 진행
          }
        }

        // 저장 완료 후 스냅샷 갱신 (다음 저장의 기준점)
        const savedTarget = savedProfile.resumeTargets.find((item) => item.id === nextId);
        if (savedTarget) {
          savedSnapshotsRef.current.set(nextId, snapshotSelfIntros(savedTarget.selfIntroductions));
        }
      }
      const refreshed = await getResume().catch(() => savedProfile);
      setProfile(refreshed ?? savedProfile);
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2500);
      if (nextId) router.push(`/recruit/resume/${encodeURIComponent(nextId)}`);
      else router.push("/recruit/resume");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-slate-400">이력서를 불러오는 중...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-300 transition-colors hover:text-slate-700" aria-label="뒤로가기">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-sm font-bold text-slate-900">{isNew ? "새 이력서 작성" : "이력서 편집"}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 outline-none transition-colors hover:border-indigo-300 focus:border-indigo-400"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button onClick={() => router.push("/recruit/resume")}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800">
            취소
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
            {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saved ? "저장됨 ✓" : saving ? (categoryStatus || "저장 중...") : "저장"}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 divide-x divide-slate-100">
        {/* Left: edit form */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-8">
            <ResumeEdit
              profile={profile}
              update={update}
              activeTargetId={activeTargetId}
              setActiveTargetId={setActiveTargetId}
              hideTargetSelector={isNew || Boolean(editId)}
              model={model}
              onEvaluate={handleEvaluate}
              onSpellcheck={handleSpellcheck}
            />
          </div>
        </div>
        {/* Right: AI sidebar */}
        <ResumeSidebar
          ref={sidebarRef}
          resumeId={activeTargetId ?? ""}
          target={profile.resumeTargets.find((t) => t.id === activeTargetId) ?? { id: "", companyName: "", jobTitle: "", jd: "", selfIntroductions: [] }}
          onInsertSelfIntro={insertSelfIntro}
          onInsertExperience={insertExperience}
          onInsertPrize={insertPrize}
        />
      </div>
    </div>
  );
}

export default function ResumeWritePage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>}>
      <WritePageClient />
    </Suspense>
  );
}
