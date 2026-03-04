"use client";

import { useState, useEffect } from "react";
import { getModels } from "@/lib/api";
import { ModelDefinition } from "@/types";
import { PipelineDiagram } from "@/settings/pipeline/PipelineDiagram/PipelineDiagram";
import { PromptTestPanel } from "@/settings/pipeline/PromptTestPanel/PromptTestPanel";

type Section = "overview" | "pipeline" | "ai-test";

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "pipeline", label: "파이프라인 테스트", icon: "⚡" },
  { id: "ai-test", label: "AI 테스트", icon: "🤖" },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("overview");
  const [models, setModels] = useState<ModelDefinition[]>([]);

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const apiModels = models.filter((m) => m.provider !== "ollama");
  const localModels = models.filter((m) => m.provider === "ollama");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white w-full max-w-5xl h-[82vh] rounded-2xl shadow-2xl flex overflow-hidden border border-slate-200">

        {/* Left sidebar */}
        <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
          {/* Header */}
          <div className="px-5 py-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">설정</h2>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors text-xs"
            >
              ✕
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                  section === item.id
                    ? "bg-white text-slate-800 font-semibold shadow-sm border border-slate-200"
                    : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
              >
                <span className="text-sm leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {section === "overview" && <OverviewSection />}
          {section === "pipeline" && <PipelineSection apiModels={apiModels} />}
          {section === "ai-test" && <AITestSection apiModels={apiModels} localModels={localModels} />}
        </div>
      </div>
    </div>
  );
}

// ─── 섹션 컴포넌트 ────────────────────────────────────────────────────────────

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="px-8 py-6 border-b border-slate-100">
      <h1 className="text-lg font-bold text-slate-800">{title}</h1>
      {desc && <p className="text-sm text-slate-500 mt-1">{desc}</p>}
    </div>
  );
}

function OverviewSection() {
  return (
    <div>
      <SectionHeader title="Overview" />
      <div className="px-8 py-8">
        <div className="bg-slate-50 rounded-2xl border border-slate-200 px-6 py-10 text-center">
          <p className="text-sm text-slate-400">준비 중입니다.</p>
        </div>
      </div>
    </div>
  );
}

function PipelineSection({ apiModels }: { apiModels: ModelDefinition[] }) {
  return (
    <div>
      <SectionHeader
        title="파이프라인 테스트"
        desc="각 파이프라인 단계를 개별적으로 또는 순서대로 테스트합니다."
      />
      <div className="px-8 py-6">
        <PipelineDiagram apiModels={apiModels} />
      </div>
    </div>
  );
}

function AITestSection({
  apiModels,
  localModels,
}: {
  apiModels: ModelDefinition[];
  localModels: ModelDefinition[];
}) {
  return (
    <div>
      <SectionHeader
        title="AI 테스트"
        desc="태스크 생성 파이프라인 전체를 실행하고 각 단계의 결과를 확인합니다."
      />
      <div className="px-8 py-6 space-y-8">
        {/* API 모델 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">API 모델</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <PromptTestPanel models={apiModels} />
        </section>

        {/* 로컬 모델 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">로컬 모델 (Ollama)</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          {localModels.length > 0 ? (
            <PromptTestPanel models={localModels} />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-8 text-center">
              <p className="text-sm text-slate-400">Ollama가 실행 중이지 않거나 설치된 모델이 없습니다.</p>
              <p className="text-xs text-slate-300 mt-1">ollama serve 후 새로고침하세요.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
