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
  type ResumeTraining,
} from "@/lib/api/resume";
import ResumeEdit from "./components/ResumeEdit";
import { useAuth } from "@/contexts/AuthContext";
import { MODELS } from "@/recruit/_constants";
import { VersionHistoryPanel } from "./_components/VersionHistoryPanel";
import { ResumePdfPanel } from "./_components/ResumePdfPanel";
import { useResumeDraftCache } from "./_hooks/useResumeDraftCache";
import { useResumeVersionHistory } from "./_hooks/useResumeVersionHistory";
import {
  createResumeTarget,
  diffSelfIntros,
  getTargetServerUpdatedAt,
  normalizeResumeProfile,
  readResumeDraftCache,
  shouldUseDraftCache,
  snapshotSelfIntros,
  type SelfIntroSnapshot,
} from "./_lib/resume-write-utils";
import ResumeSidebar, { type ResumeSidebarRef } from "../components/ResumeSidebar";

function WritePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const editId = searchParams.get("id");
  const draftRouteKey = editId ? `id:${editId}` : isNew ? "new" : "default";
  const draftCacheEnabled = !isNew;

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [, setDraftStatus] = useState("");
  const [categoryStatus, setCategoryStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);
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

  const markUnsaved = useCallback(() => setSaved(false), []);
  const {
    cancelPendingDraft,
    clearDraft,
    markDraftClean,
    markDraftHydrated,
    markHydrationPending,
    scheduleDraftCacheExpiry,
  } = useResumeDraftCache({
    routeKey: draftRouteKey,
    enabled: draftCacheEnabled,
    loading,
    profile,
    activeTargetId,
    onDirty: markUnsaved,
    onStatusChange: setDraftStatus,
  });

  const handleVersionRestored = useCallback((restoredProfile: ResumeProfile) => {
    for (const target of restoredProfile.resumeTargets) {
      savedSnapshotsRef.current.set(target.id, snapshotSelfIntros(target.selfIntroductions));
    }
    markDraftClean(restoredProfile, "선택한 버전을 복원했습니다.");
    setSaved(true);
  }, [markDraftClean]);

  const {
    handleDeleteVersion,
    handleRestoreVersion,
    loadVersionPreview,
    openVersionHistory,
    selectedVersionId,
    setVersionPanelOpen,
    versionActionId,
    versionError,
    versionPanelOpen,
    versionPreview,
    versionPreviewLoading,
    versions,
    versionsLoading,
  } = useResumeVersionHistory({
    activeTargetId,
    setProfile,
    setActiveTargetId,
    onRestored: handleVersionRestored,
  });

  useEffect(() => {
    let cancelled = false;
    markHydrationPending();

    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        if (isNew) {
          const target = createResumeTarget();
          const loaded = await getResume().catch(() => null);
          const existingTargets = loaded?.resumeTargets ?? [];
          const nextProfile = { resumeTargets: [...existingTargets, target] };
          const nextActiveTargetId = target.id;
          clearDraft();
          if (!cancelled) {
            setProfile(nextProfile);
            setActiveTargetId(nextActiveTargetId);
            setDraftStatus("");
            // 신규 타겟: 저장된 자기소개서 없음
            savedSnapshotsRef.current.set(nextActiveTargetId, new Map());
            markDraftHydrated(nextProfile);
          }
          return;
        }

        const loaded = editId
          ? await getResume(editId)
          : normalizeResumeProfile(await getResume());
        if (!loaded) {
          throw new Error("이력서를 불러오지 못했습니다.");
        }
        const selected = editId
          ? loaded?.resumeTargets.find((target) => target.id === editId) ?? null
          : loaded.resumeTargets[0];
        if (editId && !selected) {
          clearDraft();
          throw new Error("편집할 이력서를 찾을 수 없습니다.");
        }
        const serverUpdatedAt = getTargetServerUpdatedAt(loaded, selected?.id ?? null);
        const draft = readResumeDraftCache(draftRouteKey);
        const draftHasTarget = !editId || Boolean(draft?.profile.resumeTargets.some((target) => target.id === editId));
        const useDraft = draftHasTarget && shouldUseDraftCache(draft, serverUpdatedAt);
        const nextProfile = useDraft ? draft!.profile : normalizeResumeProfile(loaded);
        const nextActiveTargetId = useDraft
          ? (editId ?? draft!.activeTargetId ?? selected?.id ?? null)
          : selected?.id ?? null;
        if (draft && !useDraft) {
          clearDraft();
        }

        if (!cancelled) {
          setProfile(nextProfile);
          setActiveTargetId(nextActiveTargetId);
          setDraftStatus(useDraft ? "서버 저장본보다 최신인 임시 저장본을 복원했습니다." : "");
          if (useDraft && draft) scheduleDraftCacheExpiry(draft.expiresAt);
          // 로드 시점을 "마지막 저장 상태"로 기록
          for (const t of nextProfile.resumeTargets) {
            savedSnapshotsRef.current.set(t.id, snapshotSelfIntros(t.selfIntroductions));
          }
          markDraftHydrated(nextProfile);
        }
      } catch (error) {
        if (!cancelled) {
          setProfile({ resumeTargets: [] });
          setActiveTargetId(null);
          setLoadError(error instanceof Error ? error.message : "이력서를 불러오지 못했습니다.");
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
  }, [
    clearDraft,
    draftRouteKey,
    editId,
    isNew,
    markDraftHydrated,
    markHydrationPending,
    scheduleDraftCacheExpiry,
  ]);

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

  const insertTraining = useCallback((training: ResumeTraining) => {
    setProfile((prev) => ({
      ...prev,
      resumeTargets: prev.resumeTargets.map((t) =>
        t.id === activeTargetId
          ? { ...t, trainings: [...(t.trainings ?? []), training] }
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

  const handleEvaluateText = useCallback((subjectKey: string, title: string, content: string) => {
    sidebarRef.current?.startEval(subjectKey, title, content, model, "evaluate");
  }, [model]);

  const handleGuide = useCallback((si: ResumeSelfIntro, index: number) => {
    const target = profile.resumeTargets.find((t) => t.id === activeTargetId) ?? profile.resumeTargets[0];
    const title = si.question
      ? `문항 ${index + 1} 작성 방향: ${si.question.slice(0, 24)}${si.question.length > 24 ? "…" : ""}`
      : `문항 ${index + 1} 작성 방향`;
    const content = [
      target?.companyName ? `기업명: ${target.companyName}` : "",
      target?.jobTitle ? `직무: ${target.jobTitle}` : "",
      target?.jd ? `채용공고 JD:\n${target.jd}` : "",
      `문항:\n${si.question}`,
      si.answer.trim() ? `현재 작성 중인 답변 초안:\n${si.answer}` : "",
      "요청: 이 문항에 어떤 방향과 소재로 답변하면 좋은지 알려주세요. 완성본 대필보다 작성자가 직접 쓸 수 있는 구조, 소재 후보, 주의점, 짧은 예시 단락을 중심으로 안내해주세요.",
    ].filter(Boolean).join("\n\n");
    sidebarRef.current?.startEval(si.id, title, content, model, "example");
  }, [activeTargetId, model, profile.resumeTargets]);

  const handleSave = async () => {
    setSaving(true);
    setCategoryStatus("");
    setSaveError("");
    try {
      cancelPendingDraft();
      const savedProfile = await saveResume(profile, { replaceAll: !isNew && !editId });
      setProfile(savedProfile);
      markDraftClean(savedProfile);
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
      const finalProfile = await getResume().catch(() => savedProfile) ?? savedProfile;
      setProfile(finalProfile);
      markDraftClean(finalProfile);
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2500);
      if (nextId) router.push(`/recruit/resume/${encodeURIComponent(nextId)}`);
      else router.push("/recruit/resume");
    } catch (error) {
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : "이력서 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-slate-400">이력서를 불러오는 중...</div>;
  }

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-white text-center">
        <p className="text-sm font-semibold text-slate-700">{loadError}</p>
        <button
          type="button"
          onClick={() => router.push("/recruit/resume")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          이력서 목록으로 돌아가기
        </button>
      </div>
    );
  }

  const currentTarget = profile.resumeTargets.find((t) => t.id === activeTargetId) ?? profile.resumeTargets[0];

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 z-10 bg-white border-b border-slate-200 flex items-center justify-between px-5 py-3">
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
            className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none transition-colors hover:border-slate-400 focus:border-indigo-500"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button onClick={() => router.push("/recruit/resume")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
            취소
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
            {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saved ? "저장됨 ✓" : saving ? (categoryStatus || "저장 중...") : "저장"}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label="이력서 설정"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
                <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
              </svg>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-10 z-30 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    openVersionHistory();
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3.2V8L11 9.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3.2 5.2A5.5 5.5 0 1 1 2.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M2.5 3.5V5.7H4.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  버전 기록
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setPdfPanelOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="2" y="1.5" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M9 1.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <rect x="9" y="1.5" width="3" height="3" rx="0.4" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M5 7h5M5 9.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  </svg>
                  PDF 첨부
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {saveError && (
        <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs font-medium text-rose-700">
          {saveError}
        </div>
      )}
      <div className="flex flex-1 min-h-0 divide-x divide-slate-200">
        {/* Left: edit form */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-6">
            <ResumeEdit
              profile={profile}
              update={update}
              activeTargetId={activeTargetId}
              setActiveTargetId={setActiveTargetId}
              hideTargetSelector={isNew || Boolean(editId)}
              model={model}
              onEvaluate={handleEvaluate}
              onEvaluateText={handleEvaluateText}
              onGuide={handleGuide}
            />
          </div>
        </div>
        {/* Right: AI sidebar */}
        <ResumeSidebar
          ref={sidebarRef}
          resumeId={activeTargetId ?? ""}
          target={currentTarget ?? { id: "", companyName: "", jobTitle: "", jd: "", selfIntroductions: [] }}
          onInsertSelfIntro={insertSelfIntro}
          onInsertExperience={insertExperience}
          onInsertPrize={insertPrize}
          onInsertTraining={insertTraining}
        />
      </div>
      {pdfPanelOpen && activeTargetId && (
        <ResumePdfPanel
          resumeId={activeTargetId}
          onClose={() => setPdfPanelOpen(false)}
        />
      )}
      {versionPanelOpen && (
        <VersionHistoryPanel
          currentTarget={currentTarget}
          versionPreview={versionPreview}
          versionPreviewLoading={versionPreviewLoading}
          versionError={versionError}
          versionsLoading={versionsLoading}
          versions={versions}
          selectedVersionId={selectedVersionId}
          versionActionId={versionActionId}
          onClose={() => setVersionPanelOpen(false)}
          onLoadVersionPreview={(versionId) => {
            if (activeTargetId) void loadVersionPreview(activeTargetId, versionId);
          }}
          onRestoreVersion={(versionId) => void handleRestoreVersion(versionId)}
          onDeleteVersion={(versionId) => void handleDeleteVersion(versionId)}
        />
      )}
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
