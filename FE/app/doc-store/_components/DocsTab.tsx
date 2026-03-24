"use client";

import type { SavedDocument } from "@/lib/api/documents";
import type { ActivePopup } from "../_types";
import { DocumentCard } from "./DocumentCard";

interface Props {
  docsLoading: boolean;
  filteredDocs: SavedDocument[];
  docSearch: string;
  setDocSearch: (v: string) => void;
  activePopup: ActivePopup;
  onDocOpen: (doc: SavedDocument) => void;
  onDetailClick: (doc: SavedDocument, el: HTMLDivElement) => void;
}

export function DocsTab({
  docsLoading,
  filteredDocs,
  docSearch,
  setDocSearch,
  activePopup,
  onDocOpen,
  onDetailClick,
}: Props) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {docsLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">로딩 중...</div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-300">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M10 6H30L38 14V42H10V6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M30 6V14H38" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M17 22H31M17 28H27M17 34H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium text-slate-400">
              {docSearch ? "검색 결과가 없습니다" : "저장된 문서가 없습니다"}
            </p>
            {!docSearch && (
              <p className="text-xs text-slate-300">
                문서 작성 화면에서 저장 버튼을 누르면 여기에 표시됩니다
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
            {filteredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isActive={activePopup?.data.id === doc.id}
                onDocOpen={() => onDocOpen(doc)}
                onDetailClick={(el) => onDetailClick(doc, el)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
