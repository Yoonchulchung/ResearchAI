"use client";

import { useRef, useEffect } from "react";
import { MimeType } from "@/types";
import { ACCEPT_ALL } from "./types";

export function UploadDropdown({
  onFilesSelected,
  onClose,
  direction = "down",
}: {
  onFilesSelected: (files: File[]) => void;
  onClose: () => void;
  direction?: "up" | "down";
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const openPicker = (accept: string[]) => {
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept.join(",");
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      ACCEPT_ALL.includes(f.type as MimeType)
    );
    if (files.length > 0) {
      onFilesSelected(files);
      onClose();
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={`absolute left-0 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 ${
        direction === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5"
      }`}
    >
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleChange} />
      <button
        type="button"
        onClick={() => openPicker(ACCEPT_ALL)}
        className="w-full flex flex-col px-3 py-2 hover:bg-slate-50 transition-colors text-left"
      >
        <span className="text-xs text-slate-700 font-medium leading-tight">파일 업로드</span>
      </button>
    </div>
  );
}
