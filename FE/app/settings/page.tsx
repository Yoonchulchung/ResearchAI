"use client";

import { useState, useEffect } from "react";
import { getModels } from "../lib/api";
import { ModelDefinition } from "../types";
import { PromptTestPanel } from "../components/PromptTestPanel";

export default function SettingsPage() {
  const [models, setModels] = useState<ModelDefinition[]>([]);

  useEffect(() => {
    getModels().then(setModels);
  }, []);

  const apiModels = models.filter((m) => m.provider !== "ollama");
  const localModels = models.filter((m) => m.provider === "ollama");

  return (
    <div className="h-full overflow-y-auto px-8 py-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-800">프롬프트 테스트</h1>
        <p className="text-sm text-slate-500 mt-1">
          태스크 생성 파이프라인을 실행하고 각 단계의 결과를 확인합니다.
        </p>
      </div>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">API 모델</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <PromptTestPanel models={apiModels} />
      </section>

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
  );
}
