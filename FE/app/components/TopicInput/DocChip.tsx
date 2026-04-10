"use client";

import { MediaType } from "@/types";
import { AttachedFile } from "./types";

export function DocChip({ af, onRemove }: { af: AttachedFile; onRemove: () => void }) {
  const isPdf =
    (af.parsed?.type ?? (af.mimetype === "application/pdf" ? MediaType.PDF : MediaType.DOCX)) ===
    MediaType.PDF;
  const nameWithoutExt = af.file.name.replace(/\.[^.]+$/, "");

  return (
    <div
      className={`flex items-center gap-2 pl-2 pr-2.5 py-2 rounded-xl border max-w-48 ${
        af.error ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"
      }`}
    >
      <div
        className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-2xs font-bold text-white ${
          isPdf ? "bg-red-500" : "bg-blue-500"
        }`}
      >
        {isPdf ? "PDF" : "DOC"}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate leading-tight">{nameWithoutExt}</p>
        <p className="text-2xs text-slate-400 leading-tight">{isPdf ? "PDF" : "Word"}</p>
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {af.uploading ? (
          <span className="animate-spin text-slate-400 text-xs">◌</span>
        ) : af.error ? (
          <span className="text-red-400 text-xs">⚠</span>
        ) : (
          <span className="text-green-500 text-xs">✓</span>
        )}
        <button onClick={onRemove} className="text-slate-300 hover:text-slate-500 text-2xs leading-none">
          ✕
        </button>
      </div>
    </div>
  );
}
