"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDeletedResumes,
  getResume,
  permanentlyDeleteResume,
  restoreResume,
  type ResumeProfile,
  type ResumeTarget,
} from "@/lib/api/resume";
import { getExperiences, type Experience } from "@/lib/api/experiences";
import { ExperienceLibrarySection } from "./components/ExperienceLibrarySection";
import { ResumeView } from "./components/ResumeView";

const EMPTY_PROFILE: ResumeProfile = { resumeTargets: [] };

function formatTrashDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function TrashResumePanel({
  open,
  loading,
  items,
  busyId,
  onClose,
  onRestore,
  onPermanentDelete,
}: {
  open: boolean;
  loading: boolean;
  items: ResumeTarget[];
  busyId: string | null;
  onClose: () => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/20">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="휴지통 닫기" />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">휴지통</h2>
            <p className="mt-1 text-xs text-slate-500">삭제한 이력서를 복원하거나 영구 삭제할 수 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-xs font-semibold text-slate-400">휴지통을 불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-500">휴지통이 비어 있습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => {
                const busy = busyId === item.id;
                return (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-white p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{item.companyName || "기업명 미입력"}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-500">
                        {item.jobTitle && <span className="rounded-sm bg-slate-100 px-2 py-0.5">{item.jobTitle}</span>}
                        {item.appliedAt && <span className="rounded-sm bg-slate-100 px-2 py-0.5">{item.appliedAt}</span>}
                        {item.updatedAt && <span className="rounded-sm bg-slate-100 px-2 py-0.5">삭제 전 수정 {formatTrashDate(item.updatedAt)}</span>}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRestore(item.id)}
                        className="rounded-md border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "복원"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPermanentDelete(item.id)}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        영구 삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ResumePageContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<ResumeProfile>(EMPTY_PROFILE);
  const [deletedProfile, setDeletedProfile] = useState<ResumeProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);

  const loadResumes = async () => {
    const res = await getResume().catch(() => null);
    setProfile(res ?? EMPTY_PROFILE);
  };

  const loadTrash = async () => {
    setTrashLoading(true);
    try {
      const res = await getDeletedResumes().catch(() => null);
      setDeletedProfile(res ?? EMPTY_PROFILE);
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      getResume().catch(() => null),
      getExperiences().catch(() => [] as Experience[]),
    ]).then(([res, exps]) => {
      setProfile(res ?? EMPTY_PROFILE);
      setExperiences(exps);
      setLoading(false);
    });
  }, []);

  const openTrash = () => {
    setTrashOpen(true);
    void loadTrash();
  };

  const handleRestore = async (id: string) => {
    setTrashBusyId(id);
    try {
      await restoreResume(id);
      await Promise.all([loadResumes(), loadTrash()]);
    } finally {
      setTrashBusyId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm("이력서를 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    setTrashBusyId(id);
    try {
      await permanentlyDeleteResume(id);
      await loadTrash();
    } finally {
      setTrashBusyId(null);
    }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 flex items-center gap-3 px-5 py-3.5">
        <button onClick={() => router.push("/recruit")} className="text-slate-300 hover:text-slate-700 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-sm font-bold text-slate-900 tracking-tight">이력서</h1>
        <div className="flex-1" />
        <button
          onClick={() => router.push("/recruit/resume/write?new=1")}
          className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md transition-colors"
        >
          이력서 추가
        </button>
        <button
          type="button"
          onClick={openTrash}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
          aria-label="휴지통"
          title="휴지통"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="5" cy="9" r="1.4" fill="currentColor" />
            <circle cx="9" cy="9" r="1.4" fill="currentColor" />
            <circle cx="13" cy="9" r="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 min-h-0 divide-x divide-slate-100">
        <div className="hidden md:block w-64 xl:w-80 shrink-0 overflow-y-auto px-5 py-8">
          {experiences.length > 0 ? (
            <ExperienceLibrarySection
              allExperiences={experiences}
              linkedIds={new Set()}
              onGoTo={(exp) => router.push(`/recruit/doc-store?tab=exp${exp.sourceDocId ? `&doc=${encodeURIComponent(exp.sourceDocId)}` : ""}`)}
            />
          ) : (
            <>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-4">학내외 활동 라이브러리</h2>
              <p className="text-xs text-slate-400">저장된 학내외 활동이 없습니다.</p>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-8">
            <ResumeView
              profile={profile}
              onEdit={() => router.push("/recruit/resume/write")}
              onSelectTarget={(id) => router.push(`/recruit/resume/${encodeURIComponent(id)}`)}
            />
          </div>
        </div>
      </div>
      <TrashResumePanel
        open={trashOpen}
        loading={trashLoading}
        items={deletedProfile.resumeTargets}
        busyId={trashBusyId}
        onClose={() => setTrashOpen(false)}
        onRestore={handleRestore}
        onPermanentDelete={handlePermanentDelete}
      />
    </div>
  );
}

export default function ResumePage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>}>
      <ResumePageContent />
    </Suspense>
  );
}
