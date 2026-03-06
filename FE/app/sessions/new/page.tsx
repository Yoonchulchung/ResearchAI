"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lightResearchStream, reconnectLightResearch, createSession, getModels, JobItem, LightResearchEvent } from "@/lib/api";
import { Task, ModelDefinition } from "@/types";
import { TopicInput } from "@/components/TopicInput";
import { ModelSelector } from "@/components/ModelSelector";
import { TaskList } from "@/sessions/components/TaskList";
import { PipelineTerminal } from "@/sessions/components/PipelineTerminal";

const STORAGE_KEY = "new-session-draft";
const SEARCH_JOB_KEY = "new-session-search-job";

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
  const [jobPostings, setJobPostings] = useState<JobItem[]>([]);
  const [jobsExpanded, setJobsExpanded] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchIdRef = useRef<string | null>(null);

  // Restore draft on mount + reconnect if search was in progress
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

    // 검색 중 다른 페이지를 갔다가 돌아온 경우 재연결
    const pendingSearchId = sessionStorage.getItem(SEARCH_JOB_KEY);
    if (pendingSearchId) {
      searchIdRef.current = pendingSearchId;
      setGenerating(true);
      setProgressStep("검색 재연결 중...");
      const controller = new AbortController();
      abortControllerRef.current = controller;
      reconnectLightResearch(
        pendingSearchId,
        (event) => {
          if (event.type === "plan") {
            const label = event.source === "web" ? "웹" : event.source === "recruit" ? "채용 공고" : "웹 + 채용 공고";
            setProgressStep(`${label} 검색 중...`);
          } else if (event.type === "generating") {
            setProgressStep("AI 태스크 생성 중...");
          } else if (event.type === "log") {
            const ts = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            setTerminalLogs((prev) => [...prev, `[${ts}] ${event.message}`]);
          } else if (event.type === "jobs") {
            setJobPostings(event.jobs);
          } else if (event.type === "done") {
            sessionStorage.removeItem(SEARCH_JOB_KEY);
            setTasks(event.tasks);
            setSearchSource(event.searchPlan.source);
            setProgressStep(null);
          }
        },
        controller.signal,
      )
        .catch(() => {})
        .finally(() => {
          sessionStorage.removeItem(SEARCH_JOB_KEY);
          abortControllerRef.current = null;
          setGenerating(false);
          setProgressStep(null);
        });
    }

    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSearchEvent = (event: LightResearchEvent) => {
    if (event.type === "plan") {
      const label = event.source === "web" ? "웹" : event.source === "recruit" ? "채용 공고" : "웹 + 채용 공고";
      setProgressStep(`${label} 검색 중...`);
    } else if (event.type === "generating") {
      setProgressStep("AI 태스크 생성 중...");
    } else if (event.type === "log") {
      pushLog(event.message);
    } else if (event.type === "jobs") {
      setJobPostings(event.jobs);
    } else if (event.type === "done") {
      sessionStorage.removeItem(SEARCH_JOB_KEY);
      setTasks(event.tasks);
      setSearchSource(event.searchPlan.source);
      setProgressStep(null);
      setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    const searchId = crypto.randomUUID();
    searchIdRef.current = searchId;
    sessionStorage.setItem(SEARCH_JOB_KEY, searchId);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    setProgressStep("시작 중...");
    setTerminalLogs([]);
    setTasks([]);
    setSearchSource(null);
    setJobPostings([]);
    setError("");
    try {
      await lightResearchStream(
        topic.trim(),
        selectedApiModel,
        searchId,
        handleSearchEvent,
        controller.signal,
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        sessionStorage.removeItem(SEARCH_JOB_KEY);
        setProgressStep(null);
        pushLog("검색이 중단되었습니다.");
      } else {
        const msg = e instanceof Error ? e.message : "태스크 생성 실패";
        setError(msg);
        setProgressStep(null);
        pushLog(`오류: ${msg}`);
      }
    } finally {
      abortControllerRef.current = null;
      setGenerating(false);
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
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
          <PipelineTerminal
            logs={terminalLogs}
            progressStep={progressStep}
            onCancel={generating ? handleCancel : undefined}
          />

          {/* Job Postings */}
          {jobPostings.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setJobsExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 hover:text-slate-600 transition-colors"
              >
                <span className={`transition-transform duration-200 ${jobsExpanded ? "rotate-0" : "-rotate-90"}`}>▾</span>
                채용 공고 {jobPostings.length}건
              </button>
              {jobsExpanded && <div className="grid gap-2">
                {jobPostings.map((job, i) => (
                  <a
                    key={i}
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                          {job.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-600">{job.company}</span>
                          {job.location && <span>· {job.location}</span>}
                          {job.description && <span>· {job.description}</span>}
                        </div>
                        {job.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {job.skills.slice(0, 5).map((s, j) => (
                              <span key={j} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-medium">
                                {s}
                              </span>
                            ))}
                            {job.skills.length > 5 && (
                              <span className="text-[10px] text-slate-400">+{job.skills.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0 text-sm mt-0.5">↗</span>
                    </div>
                  </a>
                ))}
              </div>}
            </div>
          )}

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
