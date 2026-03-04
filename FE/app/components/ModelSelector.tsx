"use client";

import { useState } from "react";
import { ModelDefinition } from "@/types";

const PROVIDER_META: Record<
  string,
  { label: string; color: string; bg: string; border: string; logo: string }
> = {
  anthropic: {
    label: "Anthropic",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    logo: "🟠",
  },
  openai: {
    label: "OpenAI",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    logo: "🟢",
  },
  google: {
    label: "Google",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    logo: "🔵",
  },
  ollama: {
    label: "Ollama",
    color: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200",
    logo: "🦙",
  },
};

const PROVIDER_ORDER = ["anthropic", "openai", "google", "ollama"];

function formatContext(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function ModelCard({
  model,
  selected,
  onSelect,
}: {
  model: ModelDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = PROVIDER_META[model.provider] ?? PROVIDER_META.ollama;
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
        selected
          ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
          : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}
            >
              {meta.logo} {meta.label}
            </span>
            {selected && (
              <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                ✓ 선택됨
              </span>
            )}
          </div>
          <div className="font-bold text-slate-800 text-sm">{model.name}</div>
          <div className="text-xs text-slate-500 mt-0.5">{model.description}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-xl py-2 px-1">
          <div className="text-[10px] text-slate-400 mb-0.5">입력 토큰</div>
          <div className="font-bold text-sm text-slate-700">
            {model.inputPricePer1M === 0 ? "무료" : `$${model.inputPricePer1M}`}
          </div>
          {model.inputPricePer1M > 0 && (
            <div className="text-[10px] text-slate-400">/ 1M</div>
          )}
        </div>
        <div className="bg-slate-50 rounded-xl py-2 px-1">
          <div className="text-[10px] text-slate-400 mb-0.5">출력 토큰</div>
          <div className="font-bold text-sm text-slate-700">
            {model.outputPricePer1M === 0 ? "무료" : `$${model.outputPricePer1M}`}
          </div>
          {model.outputPricePer1M > 0 && (
            <div className="text-[10px] text-slate-400">/ 1M</div>
          )}
        </div>
        <div className="bg-slate-50 rounded-xl py-2 px-1">
          <div className="text-[10px] text-slate-400 mb-0.5">컨텍스트</div>
          <div className="font-bold text-sm text-slate-700">
            {formatContext(model.contextWindow)}
          </div>
          <div className="text-[10px] text-slate-400">토큰</div>
        </div>
      </div>
    </button>
  );
}

export function ModelSelector({
  models,
  selectedModel,
  onSelect,
  title = "AI 모델 선택",
  loading = false,
  emptyMessage,
  defaultOpen = true,
}: {
  models: ModelDefinition[];
  selectedModel: string;
  onSelect: (id: string) => void;
  title?: string;
  loading?: boolean;
  emptyMessage?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const grouped = models.reduce<Record<string, ModelDefinition[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  const selectedName = models.find((m) => m.id === selectedModel)?.name;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 헤더 (항상 표시) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <div className="flex items-center gap-2">
          {!open && selectedName && (
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              ✓ {selectedName}
            </span>
          )}
          <span className={`text-slate-400 text-xs transition-transform ${open ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {/* 콘텐츠 (토글) */}
      {open && (
        <div className="px-6 pb-6 border-t border-slate-100">
          {loading ? (
            <div className="text-slate-400 text-sm text-center py-6 animate-pulse">
              모델 목록 불러오는 중...
            </div>
          ) : models.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-6">
              {emptyMessage ?? "사용 가능한 모델이 없습니다."}
            </div>
          ) : (
            <div className="space-y-5 pt-4">
              {PROVIDER_ORDER.map((provider) => {
                const group = grouped[provider];
                if (!group?.length) return null;
                const meta = PROVIDER_META[provider];
                return (
                  <div key={provider}>
                    <div className={`text-xs font-bold ${meta.color} mb-2 flex items-center gap-1`}>
                      {meta.logo} {meta.label}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.map((m) => (
                        <ModelCard
                          key={m.id}
                          model={m}
                          selected={selectedModel === m.id}
                          onSelect={() => onSelect(m.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
