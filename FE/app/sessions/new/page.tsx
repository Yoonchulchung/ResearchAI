"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lightResearchStream, createSession, getModels } from "@/lib/api";
import { Task, ModelDefinition } from "@/types";
import { TopicInput } from "@/components/TopicInput";
import { ModelSelector } from "@/components/ModelSelector";
import { TaskList } from "@/sessions/components/TaskList";
import { PipelineTerminal } from "@/sessions/components/PipelineTerminal";

const STORAGE_KEY = "new-session-draft";

interface DraftState {
  topic: string;
  tasks: Task[];
  searchSource: "web" | "recruit" | "both" | null;
  terminalLogs: string[];
  selectedApiModel: string;
  selectedLocalModel: string;
}

export default function NewSession() {
  const router = useRouter();
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [selectedApiModel, setSelectedApiModel] = useState("claude-haiku-4-5");
  const [selectedLocalModel, setSelectedLocalModel] = useState("");
  const [topic, setTopic] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchSource, setSearchSource] = useState<"web" | "recruit" | "both" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const draft: DraftState = JSON.parse(raw);
        if (draft.topic) setTopic(draft.topic);
        if (draft.tasks?.length) setTasks(draft.tasks);
        if (draft.searchSource) setSearchSource(draft.searchSource);
        if (draft.terminalLogs?.length) setTerminalLogs(draft.terminalLogs);
        if (draft.selectedApiModel) setSelectedApiModel(draft.selectedApiModel);
        if (draft.selectedLocalModel) setSelectedLocalModel(draft.selectedLocalModel);
      }
    } catch {}
    setInitialized(true);
  }, []);

  // Persist draft — only after restore is complete
  useEffect(() => {
    if (!initialized) return;
    try {
      const draft: DraftState = { topic, tasks, searchSource, terminalLogs, selectedApiModel, selectedLocalModel };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
  }, [initialized, topic, tasks, searchSource, terminalLogs, selectedApiModel, selectedLocalModel]);

  useEffect(() => {
    getModels().then((m) => {
      setModels(m);
      const firstLocal = m.find((x) => x.provider === "ollama");
      if (firstLocal) setSelectedLocalModel(firstLocal.id);
    }).catch(() => {});
  }, []);

  const pushLog = (line: string) => {
    const ts = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminalLogs((prev) => [...prev, `[${ts}] ${line}`]);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setProgressStep("시작 중...");
    setTerminalLogs([]);
    setTasks([]);
    setSearchSource(null);
    setError("");
    try {
      await lightResearchStream(
        topic.trim(),
        selectedApiModel,
        (event) => {
          if (event.type === "plan") {
            const label = event.source === "web" ? "웹" : event.source === "recruit" ? "채용 공고" : "웹 + 채용 공고";
            setProgressStep(`${label} 검색 중...`);
          } else if (event.type === "generating") {
            setProgressStep("AI 태스크 생성 중...");
          } else if (event.type === "log") {
            pushLog(event.message);
          } else if (event.type === "done") {
            setTasks(event.tasks);
            setSearchSource(event.searchPlan.source);
            setProgressStep(null);
            setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          }
        },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "태스크 생성 실패";
      setError(msg);
      setProgressStep(null);
      pushLog(`오류: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleResearchStart = async () => {
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
      

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* API 모델 */}
          <ModelSelector
            title="API 모델"
            models={apiModels}
            selectedModel={selectedApiModel}
            onSelect={setSelectedApiModel}
            loading={isLoading}
            defaultOpen={false}
          />

          {/* 로컬 모델 */}
          <ModelSelector
            title="로컬 모델 (Ollama)"
            models={localModels}
            selectedModel={selectedLocalModel}
            onSelect={setSelectedLocalModel}
            loading={isLoading}
            emptyMessage="Ollama가 실행 중이지 않거나 설치된 모델이 없습니다."
            defaultOpen={false}
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

          {/* Terminal log */}
          <PipelineTerminal logs={terminalLogs} progressStep={progressStep} />

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              ❌ {error}
            </div>
          )}

          {/* Tasks */}
          <div ref={taskListRef}>
            <TaskList
              tasks={tasks}
              onUpdate={updateTask}
              onRemove={removeTask}
              onAdd={addTask}
              searchSource={searchSource}
            />
          </div>

          {/* Start button */}
          {tasks.length > 0 && (
            <button
              onClick={handleResearchStart}
              disabled={creating || !topic.trim()}
              className="w-full bg-linear-to-r from-indigo-600 to-indigo-500 text-white font-bold text-base py-4 rounded-2xl hover:from-indigo-700 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200"
            >
              {creating ? "⏳ 세션 생성 중..." : "리서치 세션 시작"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
