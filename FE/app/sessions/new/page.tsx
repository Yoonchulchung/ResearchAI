"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateTasks, createSession, getModels } from "../../lib/api";
import { Task, ModelDefinition } from "../../types";

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
};

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
  const meta = PROVIDER_META[model.provider];
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
            ${model.inputPricePer1M}
          </div>
          <div className="text-[10px] text-slate-400">/ 1M</div>
        </div>
        <div className="bg-slate-50 rounded-xl py-2 px-1">
          <div className="text-[10px] text-slate-400 mb-0.5">출력 토큰</div>
          <div className="font-bold text-sm text-slate-700">
            ${model.outputPricePer1M}
          </div>
          <div className="text-[10px] text-slate-400">/ 1M</div>
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

export default function NewSession() {
  const router = useRouter();
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");
  const [topic, setTopic] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const { tasks: generated } = await generateTasks(topic.trim(), selectedModel);
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
      const session = await createSession(topic.trim(), selectedModel, tasks);
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
    const newId =
      tasks.length > 0 ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;
    setTasks((prev) => [
      ...prev,
      { id: newId, title: "", icon: "📌", prompt: "" },
    ]);
  };

  const grouped = models.reduce<Record<string, ModelDefinition[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  const providerOrder = ["anthropic", "openai", "google"];
  const selectedModelDef = models.find((m) => m.id === selectedModel);

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
          {/* Model selector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">
              AI 모델 선택
            </h2>

            {models.length === 0 ? (
              <div className="text-slate-400 text-sm text-center py-6 animate-pulse">
                모델 목록 불러오는 중...
              </div>
            ) : (
              <div className="space-y-5">
                {providerOrder.map((provider) => {
                  const group = grouped[provider];
                  if (!group?.length) return null;
                  const meta = PROVIDER_META[provider];
                  return (
                    <div key={provider}>
                      <div
                        className={`text-xs font-bold ${meta.color} mb-2 flex items-center gap-1`}
                      >
                        {meta.logo} {meta.label}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {group.map((m) => (
                          <ModelCard
                            key={m.id}
                            model={m}
                            selected={selectedModel === m.id}
                            onSelect={() => setSelectedModel(m.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Topic input */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              리서치 주제
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                placeholder="예: 삼성전자 AI 전략, 테슬라 2025 로드맵, 국내 핀테크 트렌드..."
                className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
              <button
                onClick={handleGenerate}
                disabled={!topic.trim() || generating}
                className="bg-indigo-600 text-white font-semibold text-sm px-5 py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {generating ? "⏳ 생성 중..." : "✨ AI 항목 생성"}
              </button>
            </div>
            {generating && (
              <p className="text-xs text-indigo-500 mt-2 flex items-center gap-1">
                <span className="animate-pulse">●</span>
                {selectedModelDef?.name ?? selectedModel}이(가) 리서치 항목을 생성하고 있습니다...
              </p>
            )}
          </div>

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
