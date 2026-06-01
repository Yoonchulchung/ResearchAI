"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getResume, saveResume, type ResumeProfile } from "@/lib/api/resume";
import { ResumeTargetDetail } from "../components/ResumeView";

function ResumeReadContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);

  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    getResume()
      .then((res) => setProfile(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedTarget = profile?.resumeTargets?.find((t) => t.id === id) ?? null;

  const handleDelete = async () => {
    if (!id || !profile) return;
    const nextTargets = profile.resumeTargets.filter((t) => t.id !== id);
    await saveResume({ ...profile, resumeTargets: nextTargets }).catch(() => {});
    router.push("/recruit/resume");
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        이력서를 불러오는 중...
      </div>
    );
  }

  if (!selectedTarget) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
        <p className="text-sm">이력서를 찾을 수 없습니다.</p>
        <button
          onClick={() => router.push("/recruit/resume")}
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="shrink-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 flex items-center gap-3 px-5 py-3.5">
        <button
          onClick={() => router.push("/recruit/resume")}
          className="text-slate-300 hover:text-slate-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-sm font-bold text-slate-900 tracking-tight truncate">
          {selectedTarget.companyName || "이력서"}
          {selectedTarget.jobTitle && (
            <span className="ml-2 text-slate-400 font-normal">{selectedTarget.jobTitle}</span>
          )}
        </h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {deleteConfirm ? (
            <>
              <span className="text-xs text-slate-500">정말 삭제할까요?</span>
              <button
                onClick={handleDelete}
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
                onClick={() => router.push(`/recruit/resume/write?id=${encodeURIComponent(id)}`)}
                className="text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                편집
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ResumeTargetDetail
          selectedTarget={selectedTarget}
          onBackToList={() => router.push("/recruit/resume")}
        />
      </div>
    </div>
  );
}

export default function ResumeIdPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center text-slate-400 text-sm">
          이력서를 불러오는 중...
        </div>
      }
    >
      <ResumeReadContent />
    </Suspense>
  );
}
