"use client";

import { useState, useEffect } from "react";
import { getModels } from "@/lib/api";
import { ModelDefinition } from "@/types";
import { PromptTestPanel } from "@/settings/pipeline/PromptTestPanel/PromptTestPanel";
import { PipelineDiagram } from "@/settings/pipeline/PipelineDiagram/PipelineDiagram";

type Tab = "pipeline" | "api" | "local";

export default function PipelinePage() {
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");

  useEffect(() => {
    getModels().then(setModels);
  }, []);

  const apiModels = models.filter((m) => m.provider !== "ollama");
  const localModels = models.filter((m) => m.provider === "ollama");

  const tabs: { id: Tab; label: string }[] = [
    { id: "pipeline", label: "파이프라인 테스트" },
    { id: "api", label: "API 모델" },
    { id: "local", label: "로컬 모델 (Ollama)" },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="px-8 pt-6 pb-0 border-b border-slate-200 bg-white shrink-0">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {activeTab === "pipeline" && (
          <div className="max-w-5xl">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-800">파이프라인 테스트</h1>
              <p className="text-sm text-slate-500 mt-1">
                각 파이프라인 단계를 개별적으로 또는 순서대로 테스트합니다.
              </p>
            </div>
            <PipelineDiagram apiModels={apiModels} />
          </div>
        )}

        {activeTab === "api" && (
          <div className="max-w-3xl">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-800">API 모델 테스트</h1>
              <p className="text-sm text-slate-500 mt-1">
                태스크 생성 파이프라인 전체를 API 모델로 실행합니다.
              </p>
            </div>
            <PromptTestPanel models={apiModels} />
          </div>
        )}

        {activeTab === "local" && (
          <div className="max-w-3xl">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-800">로컬 모델 테스트</h1>
              <p className="text-sm text-slate-500 mt-1">
                태스크 생성 파이프라인 전체를 Ollama 로컬 모델로 실행합니다.
              </p>
            </div>
            {localModels.length > 0 ? (
              <PromptTestPanel models={localModels} />
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-8 text-center">
                <p className="text-sm text-slate-400">Ollama가 실행 중이지 않거나 설치된 모델이 없습니다.</p>
                <p className="text-xs text-slate-300 mt-1">ollama serve 후 새로고침하세요.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
