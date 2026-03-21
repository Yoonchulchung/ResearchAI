"use client";

import { useRef } from "react";
import type { SavedDocument } from "@/lib/api/documents";
import { IconDots } from "./icons";

interface Props {
  doc: SavedDocument;
  isActive: boolean;
  onCardClick: (el: HTMLDivElement) => void;
}

export function DocumentCard({ doc, isActive, onCardClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const preview = doc.content.replace(/#{1,6}\s/g, "").replace(/[*_`>\-]/g, "").trim();
  const previewText = preview.length > 120 ? preview.slice(0, 120) + "…" : preview;
  const dateStr = new Date(doc.updatedAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div
      ref={ref}
      onClick={(e) => { e.stopPropagation(); ref.current && onCardClick(ref.current); }}
      className={`relative bg-white border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all min-h-64 cursor-pointer select-none ${
        isActive ? "border-indigo-300 shadow-md ring-2 ring-indigo-100" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-indigo-600 text-white">
          문서
        </span>
        <span className="p-1 text-slate-300"><IconDots /></span>
      </div>
      <h3 className="text-base font-bold text-slate-900 leading-snug">{doc.title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed flex-1 line-clamp-2">{previewText}</p>
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-0.5">수정일</p>
        <p className="text-sm font-medium text-slate-700">{dateStr}</p>
      </div>
    </div>
  );
}
