"use client";

import { useRef, useEffect, useState } from "react";
import { MediaType, MimeType, ModelDefinition } from "@/types";

// ─── 허용 파일 타입 ────────────────────────────────────────────────────────────
const ACCEPT_IMAGE = [MimeType.JPEG, MimeType.JPG, MimeType.PNG];
const ACCEPT_DOC = [MimeType.PDF, MimeType.DOCX, MimeType.DOC];
const ACCEPT_ALL = [...ACCEPT_IMAGE, ...ACCEPT_DOC];


// ─── 업로드된 파일 타입 ────────────────────────────────────────────────────────
export interface AttachedFile {
  id: string;
  file: File;
  mimetype: string;
  parsed?: {
    type: MediaType;
    text?: string;
    pageCount?: number;
    dataUrl?: string;
    size: number;
  };
  uploading: boolean;
  error?: string;
}

// ─── 이미지 미리보기 칩 ────────────────────────────────────────────────────────
function ImageChip({ af, onRemove }: { af: AttachedFile; onRemove: () => void }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    const url = URL.createObjectURL(af.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [af.file]);

  return (
    <div className="relative group w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-slate-200">
      {src && <img src={src} alt={af.file.name} className="w-full h-full object-cover" />}
      {af.uploading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <span className="animate-spin text-white text-sm">◌</span>
        </div>
      )}
      {af.error && (
        <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center">
          <span className="text-white text-xs">⚠</span>
        </div>
      )}
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 hover:bg-black/70 text-white rounded-full text-micro flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}

// ─── PDF / DOCX 칩 ────────────────────────────────────────────────────────────
function DocChip({ af, onRemove }: { af: AttachedFile; onRemove: () => void }) {
  const isPdf = (af.parsed?.type ?? (af.mimetype === "application/pdf" ? MediaType.PDF : MediaType.DOCX)) === MediaType.PDF;
  const nameWithoutExt = af.file.name.replace(/\.[^.]+$/, "");

  return (
    <div
      className={`flex items-center gap-2 pl-2 pr-2.5 py-2 rounded-xl border max-w-48 ${
        af.error
          ? "bg-red-50 border-red-200"
          : "bg-slate-50 border-slate-200"
      }`}
    >
      {/* 아이콘 */}
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
        <button
          onClick={onRemove}
          className="text-slate-300 hover:text-slate-500 text-2xs leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  );
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
  onAbort,
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
  onAbort?: () => void;
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
          {attachedFiles.map((af) =>
            af.mimetype.startsWith("image/") ? (
              <ImageChip key={af.id} af={af} onRemove={() => removeFile(af.id)} />
            ) : (
              <DocChip key={af.id} af={af} onRemove={() => removeFile(af.id)} />
            )
          )}
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

          {generating && onAbort ? (
            <button
              onClick={onAbort}
              className="w-9 h-9 bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center justify-center transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onGenerate}
              disabled={!value.trim() || generating}
              className="w-9 h-9 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 12V4M4 8l4-4 4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
