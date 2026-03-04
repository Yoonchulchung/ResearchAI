"use client";

import { useState, useEffect } from "react";
import { testGenerateTasks } from "../lib/api";
import { ModelDefinition, Task } from "../types";

type Panel = "prompt" | "search" | "tasks";

type TestResult = {
  tasks: Task[];
  searchContext?: string;
  fullPrompt: string;
};

function ResultPanel({
  label,
  badge,
  active,
  onClick,
  children,
}: {
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
          active ? "bg-indigo-50" : "bg-white hover:bg-slate-50"
        }`}
      >
        <span className={`text-sm font-semibold ${active ? "text-indigo-700" : "text-slate-700"}`}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
          <span className={`text-xs text-slate-400 transition-transform ${active ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>
      {active && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
}

export function PromptTestPanel({ models }: { models: ModelDefinition[] }) {
  const [topic, setTopic] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>("prompt");

  useEffect(() => {
    if (models.length > 0) setSelectedModel(models[0].id);
  }, [models]);

  const handleTest = async () => {
    if (!topic.trim() || !selectedModel) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await testGenerateTasks(topic.trim(), selectedModel);
      setResult(data);
      setActivePanel("prompt");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = (panel: Panel) =>
    setActivePanel((p) => (p === panel ? ("" as Panel) : panel));

  return (
    <div className="space-y-4">
      {/* 입력 폼 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
            리서치 주제
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTest()}
            placeholder="예: AI 반도체 시장 동향"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
            모델
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-indigo-400 bg-white"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleTest}
          disabled={loading || !topic.trim() || models.length === 0}
          className="w-full bg-indigo-600 text-white font-bold text-sm py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "⏳ 실행 중..." : "▶ 테스트 실행"}
        </button>

        {error && (
          <div className="text-xs text-red-500 bg-red-50 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* 결과 패널 */}
      {result && (
        <div className="space-y-3">
          <ResultPanel
            label="AI 전달 프롬프트"
            badge={`${result.fullPrompt.length.toLocaleString()} chars`}
            active={activePanel === "prompt"}
            onClick={() => togglePanel("prompt")}
          >
            <pre className="px-4 py-4 text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed bg-white max-h-96 overflow-y-auto">
              {result.fullPrompt}
            </pre>
          </ResultPanel>

          <ResultPanel
            label="Tavily 검색 결과"
            badge={result.searchContext ? `${result.searchContext.length.toLocaleString()} chars` : "없음"}
            active={activePanel === "search"}
            onClick={() => togglePanel("search")}
          >
            {result.searchContext ? (
              <pre className="px-4 py-4 text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed bg-white max-h-96 overflow-y-auto">
                {result.searchContext}
              </pre>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-400 text-center">
                Tavily API 키가 설정되지 않았거나 검색 결과가 없습니다.
              </div>
            )}
          </ResultPanel>

          <ResultPanel
            label="생성된 태스크"
            badge={`${result.tasks.length}개`}
            active={activePanel === "tasks"}
            onClick={() => togglePanel("tasks")}
          >
            <div className="divide-y divide-slate-100 bg-white">
              {result.tasks.map((task) => (
                <div key={task.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg leading-none">{task.icon}</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {task.id}. {task.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed pl-7">
                    {task.prompt}
                  </p>
                </div>
              ))}
            </div>
          </ResultPanel>
        </div>
      )}
    </div>
  );
}
