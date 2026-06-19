"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteResumeAttachment,
  fetchResumeAttachmentFile,
  getResumeAttachments,
  uploadResumeAttachment,
  type ResumeAttachment,
} from "@/lib/api/resume";
import { pdfFileCache } from "@/lib/cache/pdfFileCache";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ResumePdfPanelProps {
  resumeId: string;
  onClose: () => void;
}

export function ResumePdfPanel({ resumeId, onClose }: ResumePdfPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useState<ResumeAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    try {
      setAttachments(await getResumeAttachments(resumeId));
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => { void load(); }, [load]);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setUploadError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      const added = await uploadResumeAttachment(resumeId, file);
      setAttachments((prev) => [...prev, added]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const handleOpenInDocParse = async (att: ResumeAttachment) => {
    setOpeningId(att.id);
    try {
      const file = await fetchResumeAttachmentFile(resumeId, att.id, att.filename);
      pdfFileCache.set(file);
      router.push("/recruit/doc-parse");
    } catch (e) {
      alert(e instanceof Error ? e.message : "파일을 열지 못했습니다.");
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = async (att: ResumeAttachment) => {
    if (!confirm(`"${att.filename}"을 삭제하시겠습니까?`)) return;
    setDeletingId(att.id);
    try {
      await deleteResumeAttachment(resumeId, att.id);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      {/* dim */}
      <div className="flex-1 bg-black/20" />

      {/* panel */}
      <aside
        className="relative flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-black text-slate-900">PDF 첨부파일</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {/* upload */}
          <button
            type="button"
            disabled={uploading || !resumeId}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {uploading ? "업로드 중…" : "PDF 파일 추가"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          {uploadError && (
            <p className="text-xs font-medium text-rose-600">{uploadError}</p>
          )}

          {/* list */}
          {loading ? (
            <p className="py-6 text-center text-xs text-slate-400">불러오는 중…</p>
          ) : attachments.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              첨부된 PDF가 없습니다.<br />위 버튼으로 추가하세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attachments.map((att) => (
                <li key={att.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                  {/* PDF icon */}
                  <div className="mt-0.5 shrink-0 rounded-md bg-red-50 p-1.5">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="1" width="9" height="12" rx="1" stroke="#ef4444" strokeWidth="1.2" />
                      <path d="M9 1l3 3" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
                      <rect x="9" y="1" width="3" height="3" rx="0.5" fill="#fecaca" stroke="#ef4444" strokeWidth="1.2" />
                      <path d="M5 7h5M5 9.5h3" stroke="#ef4444" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">{att.filename}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatBytes(att.fileSize)}
                      {att.pageCount ? ` · ${att.pageCount}p` : ""}
                    </p>

                    {/* actions */}
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        disabled={openingId === att.id}
                        onClick={() => void handleOpenInDocParse(att)}
                        className="flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {openingId === att.id ? (
                          <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        문서 분석
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === att.id}
                        onClick={() => void handleDelete(att)}
                        className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-400">
          문서 분석 버튼을 누르면 /recruit/doc-parse 페이지로 PDF가 전달됩니다.
        </div>
      </aside>
    </div>
  );
}
