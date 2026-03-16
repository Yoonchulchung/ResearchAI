"use client";

import { useRef, useEffect, useState } from "react";
import { ModelDefinition } from "@/types";

// ─── 허용 파일 타입 ────────────────────────────────────────────────────────────
const ACCEPT_IMAGE = ["image/jpeg", "image/jpg", "image/png"];
const ACCEPT_DOC = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const ACCEPT_ALL = [...ACCEPT_IMAGE, ...ACCEPT_DOC];

function getFileIcon(mimetype: string) {
  if (mimetype.startsWith("image/")) return "🖼️";
  if (mimetype === "application/pdf") return "📄";
  return "📝";
}

// ─── 업로드된 파일 타입 ────────────────────────────────────────────────────────
export interface AttachedFile {
  id: string;
  file: File;
  mimetype: string;
  parsed?: {
    type: "image" | "pdf" | "docx";
    text?: string;
    pageCount?: number;
    dataUrl?: string;
    size: number;
  };
  uploading: boolean;
  error?: string;
}

// ─── + 버튼 드롭다운 ───────────────────────────────────────────────────────────
function UploadDropdown({
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

  // 외부 클릭 시 닫기
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
      ACCEPT_ALL.includes(f.type)
    );
    if (files.length > 0) {
      onFilesSelected(files);
      onClose();
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={`absolute left-0 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 ${direction === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleChange}
      />
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

// ─── ModelSelect ───────────────────────────────────────────────────────────────
function ModelSelect({
  models,
  selectedModel,
  onChange,
  placeholder,
}: {
  models: ModelDefinition[];
  selectedModel: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  if (models.length === 0) return null;
  const isSelected = models.some((m) => m.id === selectedModel);
  return (
    <select
      value={isSelected ? selectedModel : ""}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm text-slate-500 bg-transparent focus:outline-none cursor-pointer max-w-36 truncate"
    >
      {!isSelected && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

// ─── TopicInput ────────────────────────────────────────────────────────────────
export function TopicInput({
  value,
  onChange,
  onGenerate,
  generating,
  placeholder = "리서치 주제를 입력하세요...",
  generatingLabel: _generatingLabel,
  apiModels = [],
  localModels = [],
  selectedApiModel = "",
  selectedLocalModel = "",
  onApiModelChange,
  onLocalModelChange,
  attachedFiles,
  onAttachedFilesChange,
  dropdownDirection = "down",
}: {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  generating: boolean;
  placeholder?: string;
  generatingLabel?: string;
  apiModels?: ModelDefinition[];
  localModels?: ModelDefinition[];
  selectedApiModel?: string;
  selectedLocalModel?: string;
  onApiModelChange?: (id: string) => void;
  onLocalModelChange?: (id: string) => void;
  attachedFiles?: AttachedFile[];
  onAttachedFilesChange?: (files: AttachedFile[]) => void;
  dropdownDirection?: "up" | "down";
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // functional updater 대신 ref로 최신 목록 추적
  const filesRef = useRef<AttachedFile[]>(attachedFiles ?? []);
  useEffect(() => {
    filesRef.current = attachedFiles ?? [];
  }, [attachedFiles]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const uploadToServer = async (file: File): Promise<AttachedFile["parsed"]> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("http://localhost:3001/api/media/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "업로드 실패");
    }
    const data = await res.json();
    return {
      type: data.type,
      text: data.text,
      pageCount: data.pageCount,
      dataUrl: data.dataUrl,
      size: data.size,
    };
  };

  const handleFilesSelected = async (files: File[]) => {
    if (!onAttachedFilesChange) return;

    const newEntries: AttachedFile[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      mimetype: f.type,
      uploading: true,
    }));

    onAttachedFilesChange([...(attachedFiles ?? []), ...newEntries]);

    for (const entry of newEntries) {
      try {
        const parsed = await uploadToServer(entry.file);
        onAttachedFilesChange(
          filesRef.current.map((e) =>
            e.id === entry.id ? { ...e, parsed, uploading: false } : e
          )
        );
      } catch (err) {
        onAttachedFilesChange(
          filesRef.current.map((e) =>
            e.id === entry.id
              ? { ...e, uploading: false, error: (err as Error).message }
              : e
          )
        );
      }
    }
  };

  const removeFile = (id: string) => {
    onAttachedFilesChange?.((attachedFiles ?? []).filter((f) => f.id !== id));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 pt-4 pb-3 shadow-sm">
      {/* 첨부 파일 칩 목록 */}
      {attachedFiles && attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {attachedFiles.map((af) => (
            <div
              key={af.id}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${
                af.error
                  ? "bg-red-50 border-red-200 text-red-600"
                  : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
            >
              <span>{getFileIcon(af.mimetype)}</span>
              <span className="max-w-28 truncate">{af.file.name}</span>
              <span>
                {af.uploading ? (
                  <span className="animate-spin inline-block text-xs text-slate-400">◌</span>
                ) : af.error ? (
                  <span className="text-red-400">⚠</span>
                ) : (
                  <span className="text-green-500">✓</span>
                )}
              </span>
              <button
                onClick={() => removeFile(af.id)}
                className="text-slate-300 hover:text-slate-500 ml-0.5"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onGenerate();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="w-full resize-none text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none bg-transparent leading-relaxed mb-3 min-h-8"
      />

      <div className="flex items-center justify-between">
        {/* + 버튼 + 드롭다운 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown((v) => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-xl leading-none ${
              showDropdown
                ? "bg-slate-100 text-slate-600"
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            }`}
          >
            +
          </button>

          {showDropdown && (
            <UploadDropdown
              onFilesSelected={handleFilesSelected}
              onClose={() => setShowDropdown(false)}
              direction={dropdownDirection}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <ModelSelect
            models={apiModels}
            selectedModel={selectedApiModel}
            onChange={onApiModelChange ?? (() => {})}
            placeholder="API 모델"
          />
          {apiModels.length > 0 && localModels.length > 0 && (
            <span className="text-slate-200 text-xs select-none">|</span>
          )}
          <ModelSelect
            models={localModels}
            selectedModel={selectedLocalModel}
            onChange={onLocalModelChange ?? (() => {})}
            placeholder="로컬 모델"
          />

          <button
            onClick={onGenerate}
            disabled={!value.trim() || generating}
            className="w-9 h-9 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
          >
            {generating ? (
              <span className="text-xs animate-spin inline-block">◌</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 12V4M4 8l4-4 4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
