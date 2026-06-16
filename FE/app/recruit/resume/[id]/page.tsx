"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { deleteResume, fetchResumePdf, getResume, type ResumeProfile, type ResumeTarget } from "@/lib/api/resume";
import { ResumeTargetDetail } from "../components/ResumeView";

function safePdfFilename(target: ResumeTarget) {
  const base = [target.companyName || "이력서", target.jobTitle || ""]
    .filter(Boolean)
    .join("_")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_");
  return `${base || "resume"}.pdf`;
}

function ResumeReadContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);

  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    getResume()
      .then((res) => setProfile(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedTarget = profile?.resumeTargets?.find((t) => t.id === id) ?? null;

  const handleDownloadPdf = async () => {
    if (!selectedTarget || pdfLoading) return;
    setPdfLoading(true);
    setPdfError("");
    try {
      const blob = await fetchResumePdf(selectedTarget.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safePdfFilename(selectedTarget);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "이력서 PDF 생성에 실패했습니다.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !profile) return;
    await deleteResume(id).catch(() => {});
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
    <div className="h-full flex flex-col bg-white print:block print:h-auto">
      {/* Header */}
      <div className="shrink-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 flex items-center gap-3 px-5 py-3.5 print:hidden">
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
                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-md transition-colors"
              >
                확인
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-md transition-colors"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => router.push(`/recruit/resume/${encodeURIComponent(id)}/interview`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-3 py-1.5 rounded-md transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M4.2 8.5h5.6M4.2 5.5h3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M2.5 2.5h9v7.2h-4L5.2 12v-2.3H2.5V2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                면접
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pdfLoading ? (
                  <span className="h-3 w-3 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M4 1.5h4.3L11 4.2V12.5H4V1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M8.2 1.6V4.3H11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M2 7.5h2M6 8.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                )}
                {pdfLoading ? "생성 중" : "PDF"}
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors"
              >
                삭제
              </button>
              <button
                onClick={() => router.push(`/recruit/resume/write?id=${encodeURIComponent(id)}`)}
                className="text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-md transition-colors"
              >
                편집
              </button>
            </>
          )}
        </div>
      </div>
      {pdfError && (
        <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs font-medium text-rose-700">
          {pdfError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden print:block print:overflow-visible">
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
