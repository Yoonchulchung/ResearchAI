"use client";

import { useRef, useEffect } from "react";
import { ModelDefinition } from "../types";

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

export function TopicInput({
  value,
  onChange,
  onGenerate,
  generating,
  apiModels = [],
  localModels = [],
  selectedApiModel = "",
  selectedLocalModel = "",
  onApiModelChange,
  onLocalModelChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  generating: boolean;
  apiModels?: ModelDefinition[];
  localModels?: ModelDefinition[];
  selectedApiModel?: string;
  selectedLocalModel?: string;
  onApiModelChange?: (id: string) => void;
  onLocalModelChange?: (id: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const apiName = apiModels.find((m) => m.id === selectedApiModel)?.name ?? "";
  const localName = localModels.find((m) => m.id === selectedLocalModel)?.name ?? "";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 pt-4 pb-3 shadow-sm">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onGenerate();
          }
        }}
        placeholder="리서치 주제를 입력하세요..."
        rows={1}
        className="w-full resize-none text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none bg-transparent leading-relaxed mb-3 min-h-8"
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-xl leading-none"
        >
          +
        </button>

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

      {generating && (
        <p className="text-xs text-indigo-500 mt-2 flex items-center gap-1">
          <span className="animate-pulse">●</span>
          {[apiName, localName].filter(Boolean).join(" + ") || "AI"}이(가) 리서치 항목을 생성하고 있습니다...
        </p>
      )}
    </div>
  );
}
