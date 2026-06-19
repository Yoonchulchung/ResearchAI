"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ResumeAttachment,
  deleteResumeAttachment,
  fetchResumeAttachmentFile,
  getResumeAttachments,
  uploadResumeAttachment,
} from "@/lib/api/resume";
import { pdfFileCache } from "@/lib/cache/pdfFileCache";

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortfolioSection({ resumeId }: { resumeId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ResumeAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!resumeId) return;
    getResumeAttachments(resumeId)
      .then(setAttachments)
      .catch(() => undefined);
  }, [resumeId]);

  const handleFile = async (file: File) => {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
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

  const handleOpen = async (att: ResumeAttachment) => {
    setOpeningId(att.id);
    try {
      const file = await fetchResumeAttachmentFile(
        resumeId,
        att.id,
        att.filename,
      );
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
    <section className="border-t border-slate-200 pt-6 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-900">포트폴리오</h2>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 2v8M2 6h8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          {uploading ? "업로드 중…" : "PDF 추가"}
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
      </div>

      {uploadError && (
        <p className="mb-3 text-xs font-medium text-rose-600">{uploadError}</p>
      )}

      {attachments.length === 0 ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-5 text-xs font-semibold text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600 disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect
              x="1.5"
              y="1"
              width="8"
              height="11"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M8 1l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <rect
              x="8"
              y="1"
              width="3.5"
              height="3.5"
              rx="0.5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M3.5 6.5h5M3.5 8.5h3"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
          PDF 파일을 추가하세요
        </button>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5"
            >
              {/* icon */}
              <div className="shrink-0 rounded-md bg-red-50 p-1.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect
                    x="1.5"
                    y="1"
                    width="8"
                    height="11"
                    rx="1"
                    stroke="#ef4444"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M8 1l3.5 3.5"
                    stroke="#ef4444"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <rect
                    x="8"
                    y="1"
                    width="3.5"
                    height="3.5"
                    rx="0.5"
                    stroke="#ef4444"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M3.5 6h4M3.5 8h2.5"
                    stroke="#ef4444"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              {/* info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">
                  {att.filename}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatBytes(att.fileSize)}
                  {att.pageCount ? ` · ${att.pageCount}p` : ""}
                </p>
              </div>
              {/* actions */}
              <button
                type="button"
                disabled={openingId === att.id}
                onClick={() => void handleOpen(att)}
                className="flex shrink-0 items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50"
              >
                {openingId === att.id ? (
                  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6h8M7 3l3 3-3 3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                문서 분석
              </button>
              <button
                type="button"
                disabled={deletingId === att.id}
                onClick={() => void handleDelete(att)}
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40"
                aria-label="삭제"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 2l8 8M10 2L2 10"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
