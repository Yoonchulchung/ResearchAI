"use client";

import { useState, useEffect } from "react";
import { getModels } from "@/lib/api";
import { ModelDefinition } from "@/types";
import { PromptTestPanel } from "@/settings/pipeline/PromptTestPanel/PromptTestPanel";
import { PipelineDiagram } from "@/settings/pipeline/PipelineDiagram/PipelineDiagram";
import { RecruitTestPanel } from "@/settings/pipeline/RecruitTestPanel/RecruitTestPanel";
import { RagDebugPanel } from "@/settings/pipeline/RagDebugPanel/RagDebugPanel";
import { DocParsePanel } from "@/settings/pipeline/DocParsePanel/DocParsePanel";
import { AiCallLogPanel } from "@/settings/pipeline/AiCallLogPanel/AiCallLogPanel";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

type Tab = "pipeline" | "api" | "local" | "recruit" | "rag" | "docparse" | "calllog";

export default function PipelinePage() {
  const { theme, uiStyle } = useTheme();
  const { user } = useAuth();
  const isGlass = uiStyle === "glass";
  const isDark = theme === "dark";

  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");

  useEffect(() => {
    getModels().then(setModels);
  }, []);

  const cloudAiModels = models.filter((m) => m.provider !== "ollama");
  const localAiModels = models.filter((m) => m.provider === "ollama");

  const tabs: { id: Tab; label: string }[] = [
    { id: "pipeline", label: "파이프라인 테스트" },
    { id: "recruit", label: "채용 공고" },
    { id: "api", label: "API 모델" },
    { id: "local", label: "로컬 모델 (Ollama)" },
    { id: "docparse", label: "문서 파싱" },
    { id: "rag", label: "RAG 디버그" },
    { id: "calllog", label: "AI 호출 이력" },
  ];

  if (user?.role !== "admin") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className={`text-center px-8 py-12 rounded-2xl border ${isDark ? "bg-white/5 border-white/10 text-white/60" : "bg-white border-slate-200 text-slate-500"}`}>
          <div className="text-3xl mb-3">🔒</div>
          <p className="text-sm font-medium">관리자 전용 페이지입니다.</p>
          <p className={`text-xs mt-1 ${isDark ? "text-white/30" : "text-slate-400"}`}>접근 권한이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col overflow-hidden transition-all ${isGlass ? "p-3 pr-4 pb-4 bg-transparent" : ""}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl" : ""}`}>
        {/* Tab bar */}
        <div className={`px-8 pt-6 pb-0 shrink-0 ${isGlass ? `border-b ${isDark ? "border-white/20" : "border-black/10"}` : "border-b border-slate-200 bg-white"}`}>
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? (isGlass && isDark)
                      ? "border-white/70 text-white"
                      : "border-indigo-500 text-indigo-600 bg-white"
                    : (isGlass && isDark)
                      ? "border-transparent text-white/50 hover:text-white/80"
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
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>파이프라인 테스트</h1>
                <p className={`text-sm mt-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  각 파이프라인 단계를 개별적으로 또는 순서대로 테스트합니다.
                </p>
              </div>
              <PipelineDiagram cloudAiModels={cloudAiModels} localAiModels={localAiModels} />
            </div>
          )}

          {activeTab === "recruit" && (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>채용 공고 테스트</h1>
                <p className={`text-sm mt-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  liveSearch로 채용 공고를 실시간 수집하고 결과를 확인합니다.
                </p>
              </div>
              <RecruitTestPanel />
            </div>
          )}

          {activeTab === "api" && (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>API 모델 테스트</h1>
                <p className={`text-sm mt-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  태스크 생성 파이프라인 전체를 API 모델로 실행합니다.
                </p>
              </div>
              <PromptTestPanel models={cloudAiModels} />
            </div>
          )}

          {activeTab === "docparse" && (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>문서 파싱 테스트</h1>
                <p className={`text-sm mt-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  PDF / DOCX 파일을 업로드해 텍스트 추출 결과와 파싱 품질을 확인합니다.
                </p>
              </div>
              <DocParsePanel />
            </div>
          )}

          {activeTab === "rag" && (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>RAG 디버그</h1>
                <p className={`text-sm mt-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  쿼리를 입력해 3개 컬렉션(research / experience / document)의 검색 결과와 유사도 점수를 확인합니다.
                </p>
              </div>
              <RagDebugPanel />
            </div>
          )}

          {activeTab === "calllog" && (
            <div className="max-w-5xl">
              <div className="mb-6">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>AI 호출 이력</h1>
                <p className={`text-sm mt-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  AI 모델로 보낸 요청과 응답 이력을 확인합니다. 행을 클릭하면 상세 내용을 볼 수 있습니다.
                </p>
              </div>
              <AiCallLogPanel />
            </div>
          )}

          {activeTab === "local" && (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>로컬 모델 테스트</h1>
                <p className={`text-sm mt-1 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                  태스크 생성 파이프라인 전체를 Ollama 로컬 모델로 실행합니다.
                </p>
              </div>
              {localAiModels.length > 0 ? (
                <PromptTestPanel models={localAiModels} />
              ) : (
                <div className={`rounded-2xl border px-5 py-8 text-center ${isGlass ? (isDark ? "border-white/20 bg-white/5" : "border-black/10 bg-black/5") : "bg-white border-slate-200"}`}>
                  <p className={`text-sm ${isDark ? "text-white/40" : "text-slate-500"}`}>Ollama가 실행 중이지 않거나 설치된 모델이 없습니다.</p>
                  <p className={`text-xs mt-1 ${isDark ? "text-white/25" : "text-slate-400"}`}>ollama serve 후 새로고침하세요.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
