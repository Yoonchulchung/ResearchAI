"use client";

import { useRef, useEffect, useState } from "react";
import { ModelDefinition } from "@/types";
import { useTheme } from "@/contexts/ThemeContext";
import { AttachedFile } from "./types";
import { ImageChip } from "./ImageChip";
import { DocChip } from "./DocChip";
import { UploadDropdown } from "./UploadDropdown";
import { ModelSelect } from "./ModelSelect";
import { useFileUpload } from "./useFileUpload";

export type { AttachedFile } from "./types";

export function TopicInput({
  value,
  onChange,
  onGenerate,
  onAbort,
  generating,
  placeholder = "리서치 주제를 입력하세요...",
  cloudAiModels = [],
  localAiModels = [],
  webEngines = [],
  selectedCloudAiModel = "",
  selectedLocalAiModel = "",
  selectedWebModel = "",
  onCloudAiModelChange,
  onLocalAiModelChange,
  onWebModelChange,
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
  cloudAiModels?: ModelDefinition[];
  localAiModels?: ModelDefinition[];
  webEngines?: { id: string; name: string; builtin: boolean }[];
  selectedCloudAiModel?: string;
  selectedLocalAiModel?: string;
  selectedWebModel?: string;
  onCloudAiModelChange?: (id: string) => void;
  onLocalAiModelChange?: (id: string) => void;
  onWebModelChange?: (id: string) => void;
  attachedFiles?: AttachedFile[];
  onAttachedFilesChange?: (files: AttachedFile[]) => void;
  dropdownDirection?: "up" | "down";
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const {
    isDragOver,
    handleFilesSelected,
    removeFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
  } = useFileUpload(attachedFiles, onAttachedFilesChange);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative rounded-xl px-2.5 sm:px-3 pt-2.5 sm:pt-3 pb-2 transition-colors border shadow-sm ${
        isDragOver
          ? "border-indigo-400 bg-indigo-50/60"
          : isDark
          ? "bg-[#0f172a] border-slate-700/50"
          : "bg-slate-50 border-slate-200"
      }`}
    >
      {isDragOver && (
        <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none z-10">
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/90 text-white text-sm font-medium rounded-xl shadow-lg">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v8M5 7l3 3 3-3M3 13h10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            파일을 놓으세요
          </div>
        </div>
      )}

      {attachedFiles && attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {attachedFiles.map((af) =>
            af.mimetype.startsWith("image/") ? (
              <ImageChip key={af.id} af={af} onRemove={() => removeFile(af.id)} />
            ) : (
              <DocChip key={af.id} af={af} onRemove={() => removeFile(af.id)} />
            ),
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
        className={`w-full border-none focus:ring-0 resize-none text-xs !outline-none !bg-transparent leading-relaxed mb-1.5 min-h-5 max-h-24 ${
          isDark ? "text-white placeholder:text-white/40" : "text-slate-800 placeholder:text-slate-300"
        }`}
      />

      <div className="flex items-end gap-1.5 sm:gap-2">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowDropdown((v) => !v)}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-base leading-none ${
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

        {/* 모델 셀렉트들 — 좁은 화면에서 자동 줄바꿈 */}
        <div className="flex items-center gap-x-1 sm:gap-x-2 gap-y-0.5 flex-wrap justify-end flex-1 min-w-0 overflow-hidden">
          {cloudAiModels.length > 0 && (
            <ModelSelect
              models={cloudAiModels}
              selectedModel={selectedCloudAiModel}
              onChange={onCloudAiModelChange ?? (() => {})}
              placeholder="API 모델"
            />
          )}
          {cloudAiModels.length > 0 && localAiModels.length > 0 && (
            <span className="hidden sm:inline text-slate-200 text-xs select-none shrink-0">|</span>
          )}
          {localAiModels.length > 0 && (
            <ModelSelect
              models={localAiModels}
              selectedModel={selectedLocalAiModel}
              onChange={onLocalAiModelChange ?? (() => {})}
              placeholder="로컬 모델"
            />
          )}
          {webEngines.length > 0 && (cloudAiModels.length > 0 || localAiModels.length > 0) && (
            <span className="hidden sm:inline text-slate-200 text-xs select-none shrink-0">|</span>
          )}
          {webEngines.length > 0 && (
            <select
              value={selectedWebModel}
              onChange={(e) => onWebModelChange?.(e.target.value)}
              className="min-w-0 max-w-[8.5rem] sm:max-w-28 truncate text-[11px] sm:text-xs text-slate-500 !bg-transparent focus:outline-none cursor-pointer"
            >
              {webEngines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {generating && onAbort ? (
          <button
            onClick={onAbort}
            className="w-8 h-8 shrink-0 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="2" width="8" height="8" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            onClick={onGenerate}
            disabled={!value.trim() || generating}
            className="w-8 h-8 shrink-0 bg-brand-primary hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-all shadow-md shadow-brand-primary/30"
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
  );
}
