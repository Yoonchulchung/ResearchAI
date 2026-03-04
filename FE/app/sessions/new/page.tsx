"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateTasks, createSession, getModels } from "../../lib/api";
import { Task, ModelDefinition } from "../../types";
import { TopicInput } from "../../components/TopicInput";
import { ModelSelector } from "../../components/ModelSelector";

export default function NewSession() {
  const router = useRouter();
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [selectedApiModel, setSelectedApiModel] = useState("claude-sonnet-4-6");
  const [selectedLocalModel, setSelectedLocalModel] = useState("");
  const [topic, setTopic] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getModels().then((m) => {
      setModels(m);
      const firstLocal = m.find((x) => x.provider === "ollama");
      if (firstLocal) setSelectedLocalModel(firstLocal.id);
    }).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const { tasks: generated } = await generateTasks(topic.trim(), selectedApiModel);
      setTasks(generated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "태스크 생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  const handleStart = async () => {
    if (!topic.trim() || tasks.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const session = await createSession(topic.trim(), selectedApiModel, tasks);
      router.push(`/sessions/${session.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "세션 생성 실패");
      setCreating(false);
    }
  };

  const updateTask = (idx: number, field: keyof Task, value: string) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
    );
  };

  const removeTask = (idx: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== idx));
  };

  const addTask = () => {
    const newId = tasks.length > 0 ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;
    setTasks((prev) => [...prev, { id: newId, title: "", icon: "📌", prompt: "" }]);
  };

  const apiModels = models.filter((m) => m.provider !== "ollama");
  const localModels = models.filter((m) => m.provider === "ollama");
  const isLoading = models.length === 0;

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="px-8 py-6 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-lg">
            ✨
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">새 리서치 만들기</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              모델 선택 → 주제 입력 → AI가 조사 항목 자동 생성
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-5xl space-y-6">
          {/* API 모델 */}
          <ModelSelector
            title="API 모델"
            models={apiModels}
            selectedModel={selectedApiModel}
            onSelect={setSelectedApiModel}
            loading={isLoading}
          />

          {/* 로컬 모델 */}
          <ModelSelector
            title="로컬 모델 (Ollama)"
            models={localModels}
            selectedModel={selectedLocalModel}
            onSelect={setSelectedLocalModel}
            loading={isLoading}
            emptyMessage="Ollama가 실행 중이지 않거나 설치된 모델이 없습니다."
          />

          {/* Topic input */}
          <TopicInput
            value={topic}
            onChange={setTopic}
            onGenerate={handleGenerate}
            generating={generating}
            apiModels={apiModels}
            localModels={localModels}
            selectedApiModel={selectedApiModel}
            selectedLocalModel={selectedLocalModel}
            onApiModelChange={setSelectedApiModel}
            onLocalModelChange={setSelectedLocalModel}
          />

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              ❌ {error}
            </div>
          )}

          {/* Tasks */}
          {tasks.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700">
                  조사 항목 ({tasks.length}개)
                </h2>
                <p className="text-xs text-slate-400">수정하거나 직접 추가 가능</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {tasks.map((task, idx) => (
                  <div
                    key={task.id}
                    className="border border-slate-100 rounded-xl p-4 hover:border-indigo-200 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        value={task.icon}
                        onChange={(e) => updateTask(idx, "icon", e.target.value)}
                        className="w-9 text-center border border-slate-200 rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                      <div className="flex-1 min-w-0">
                        <input
                          value={task.title}
                          onChange={(e) => updateTask(idx, "title", e.target.value)}
                          placeholder="항목 제목"
                          className="w-full font-semibold text-sm text-slate-800 border-0 focus:outline-none mb-1 bg-transparent"
                        />
                        <textarea
                          value={task.prompt}
                          onChange={(e) => updateTask(idx, "prompt", e.target.value)}
                          placeholder="검색 프롬프트"
                          rows={2}
                          className="w-full text-xs text-slate-500 border border-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200 resize-none"
                        />
                      </div>
                      <button
                        onClick={() => removeTask(idx)}
                        className="text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 mt-1 shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addTask}
                className="mt-3 w-full border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 rounded-xl py-3 text-sm font-medium transition-colors"
              >
                + 항목 직접 추가
              </button>
            </div>
          )}

          {/* Start button */}
          {tasks.length > 0 && (
            <button
              onClick={handleStart}
              disabled={creating || !topic.trim()}
              className="w-full bg-linear-to-r from-indigo-600 to-indigo-500 text-white font-bold text-base py-4 rounded-2xl hover:from-indigo-700 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200"
            >
              {creating ? "⏳ 세션 생성 중..." : "🚀 리서치 세션 시작"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
