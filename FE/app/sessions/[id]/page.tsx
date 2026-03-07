"use client";

import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, getChatHistory, clearChatHistory, chatStream, getModels, triggerCompaction, getCompactionStatus } from "@/lib/api";
import { deepResearchStream } from "@/lib/api/research";
import { updateTask } from "@/lib/api/sessions";
import { queueRegisterJob, queueUpdateJob, queueRemoveJob } from "@/lib/api/queue";
import { Session, Task, TaskStatus, SearchSources, ChatMessage, ModelDefinition } from "@/types";
import { TaskCard, type Phase } from "@/sessions/components/TaskCard";
import { SessionHeader } from "@/sessions/components/SessionHeader";
import { SessionSkeleton } from "@/sessions/components/SessionSkeleton";
import { ChatSection } from "@/sessions/components/ChatSection";
import { SummarySection } from "@/sessions/components/SummarySection";
import { TopicInput } from "@/components/TopicInput";
import { useResearchQueue } from "@/contexts/ResearchQueueContext";

// 입력 상태를 격리하여 타이핑 시 상위 컴포넌트 리렌더 방지
const ChatInputArea = memo(function ChatInputArea({
  onSend,
  generating,
  apiModels,
  localModels,
  defaultModel,
}: {
  onSend: (message: string, model: string) => void;
  generating: boolean;
  apiModels: ModelDefinition[];
  localModels: ModelDefinition[];
  defaultModel: string;
}) {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel);

  useEffect(() => { setSelectedModel(defaultModel); }, [defaultModel]);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg || generating) return;
    setValue("");
    onSend(msg, selectedModel);
  }, [value, generating, selectedModel, onSend]);

  return (
    <TopicInput
      value={value}
      onChange={setValue}
      onGenerate={handleSend}
      generating={generating}
      placeholder="리서치 내용에 대해 질문하세요..."
      generatingLabel="AI가 답변을 생성하고 있습니다..."
      apiModels={apiModels}
      localModels={localModels}
      selectedApiModel={selectedModel}
      selectedLocalModel={selectedModel}
      onApiModelChange={setSelectedModel}
      onLocalModelChange={setSelectedModel}
    />
  );
});

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [compactionStatus, setCompactionStatus] = useState<"idle" | "running" | "done">("idle");

  // 태스크별 스트리밍 실행 상태
  const [taskRunStates, setTaskRunStates] = useState<Record<string, {
    status: TaskStatus;
    phase?: Phase;
    result?: string;
    sources?: SearchSources;
  }>>({});
  const abortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);

  // 큐 DB 상태 구독
  const { jobs: queueJobs } = useResearchQueue();
  const sessionQueueJobs = useMemo(
    () => queueJobs.filter((j) => j.sessionId === id),
    [queueJobs, id],
  );

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setSession(null);
    setChatMessages([]);
    setTaskRunStates({});
    getSession(id)
      .then((s) => { setSession(s); })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
    getChatHistory(id).then(setChatMessages).catch(() => {});
  }, [id, router]);

  // 새 채팅 메시지가 추가되면 하단으로 스크롤
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const statuses = useMemo<Record<string, TaskStatus>>(() => {
    const base: Record<string, TaskStatus> = { ...(session?.statuses ?? {}) };
    // 큐 DB 상태 반영 (done/error는 session이 우선)
    for (const job of sessionQueueJobs) {
      const key = String(job.taskId);
      if (base[key] === "done" || base[key] === "error") continue;
      if (job.status === "running") base[key] = "loading";
      else if (job.status === "pending") base[key] = base[key] ?? "idle";
    }
    // 로컬 스트리밍 상태가 최우선
    for (const [key, state] of Object.entries(taskRunStates)) {
      base[key] = state.status;
    }
    return base;
  }, [session, taskRunStates, sessionQueueJobs]);

  const phases = useMemo<Record<string, Phase>>(() => {
    const p: Record<string, Phase> = {};
    // 큐 DB의 phase 반영
    for (const job of sessionQueueJobs) {
      if (job.status === "running" && job.phase) p[String(job.taskId)] = job.phase;
    }
    // 로컬 스트리밍 phase가 최우선
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.status === "loading" && state.phase) p[key] = state.phase;
    }
    return p;
  }, [taskRunStates, sessionQueueJobs]);

  const results = useMemo<Record<string, string>>(() => {
    const base = { ...(session?.results ?? {}) };
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.result) base[key] = state.result;
    }
    return base;
  }, [session, taskRunStates]);

  const sources = useMemo<Record<string, SearchSources>>(() => {
    const base = { ...(session?.sources ?? {}) };
    for (const [key, state] of Object.entries(taskRunStates)) {
      if (state.sources) base[key] = state.sources;
    }
    return base;
  }, [session, taskRunStates]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const runTask = useCallback(async (task: Task, signal: AbortSignal) => {
    if (!session) return;
    const key = String(task.id);
    setTaskRunStates((prev) => ({ ...prev, [key]: { status: "loading", phase: "searching" } }));

    // 큐에 외부 추적 등록
    let queueJobId: string | null = null;
    queueRegisterJob({
      sessionId: id,
      sessionTopic: session.topic,
      taskId: task.id,
      taskTitle: task.title,
      taskIcon: task.icon,
      taskPrompt: task.prompt,
      model: session.model,
    }).then((job) => { queueJobId = job.jobId; }).catch(() => {});

    try {
      await deepResearchStream(
        task.prompt,
        session.model,
        undefined,
        (event) => {
          if (event.type === "log") {
            const phase: Phase = event.message.includes("AI 심층") ? "analyzing" : "searching";
            setTaskRunStates((prev) => ({ ...prev, [key]: { ...prev[key], status: "loading", phase } }));
            if (queueJobId) queueUpdateJob(queueJobId, { phase }).catch(() => {});
          } else if (event.type === "done") {
            const src = event.sources as unknown as SearchSources;
            setTaskRunStates((prev) => ({ ...prev, [key]: { status: "done", result: event.result, sources: src } }));
            updateTask(id, task.id, event.result, "done", event.sources).catch(() => {});
            if (queueJobId) queueUpdateJob(queueJobId, { status: "done" }).catch(() => {});
          }
        },
        signal,
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setTaskRunStates((prev) => ({ ...prev, [key]: { ...prev[key], status: "idle" } }));
        if (queueJobId) queueRemoveJob(queueJobId).catch(() => {});
        throw e;
      }
      const msg = e instanceof Error ? e.message : "오류";
      setTaskRunStates((prev) => ({ ...prev, [key]: { status: "error", result: msg } }));
      updateTask(id, task.id, msg, "error").catch(() => {});
      if (queueJobId) queueUpdateJob(queueJobId, { status: "error" }).catch(() => {});
    }
  }, [session, id]);

  const handleRunTask = useCallback(async (task: Task) => {
    // 큐 DB에 이미 pending/running인 작업이 있으면 중복 실행 방지
    const queueJob = sessionQueueJobs.find((j) => j.taskId === task.id);
    if (queueJob?.status === "pending" || queueJob?.status === "running") return;

    if (isRunningRef.current) return;
    const abort = new AbortController();
    abortRef.current = abort;
    isRunningRef.current = true;
    setIsRunning(true);
    try {
      await runTask(task, abort.signal);
    } catch { /* AbortError는 runTask 내부에서 처리됨 */ }
    finally {
      isRunningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [runTask, sessionQueueJobs]);

  const handleRunAll = useCallback(async () => {
    if (isRunningRef.current || !session) return;
    const pendingTasks = session.tasks.filter((t) => {
      const s = (session.statuses ?? {})[String(t.id)];
      if (s === "done") return false;
      // 큐 DB에 active 작업이 있으면 건너뜀
      const queueJob = sessionQueueJobs.find((j) => j.taskId === t.id);
      if (queueJob?.status === "pending" || queueJob?.status === "running") return false;
      return !s || s === "idle" || s === "error";
    });
    const abort = new AbortController();
    abortRef.current = abort;
    isRunningRef.current = true;
    setIsRunning(true);
    try {
      for (const task of pendingTasks) {
        if (abort.signal.aborted) break;
        await runTask(task, abort.signal);
      }
    } catch { /* AbortError로 루프 중단 */ }
    finally {
      isRunningRef.current = false;
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [session, runTask, sessionQueueJobs]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleChatSend = useCallback(async (message: string, model: string) => {
    if (!session || chatLoading) return;
    setChatLoading(true);

    // user 메시지 즉시 표시 + AI 응답 placeholder 추가
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);

    // 청크를 누적했다가 rAF 단위(~16ms)로 한 번만 setState
    let accumulated = "";
    let rafId: number | null = null;
    const flush = () => {
      const text = accumulated;
      setChatMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: text };
        }
        return updated;
      });
      rafId = null;
    };

    try {
      await chatStream(id, message, model || session.model, (chunk) => {
        accumulated += chunk;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      });
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
    } catch {
      if (rafId !== null) cancelAnimationFrame(rafId);
      setChatMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = { ...last, content: "오류가 발생했습니다. 다시 시도해 주세요." };
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  }, [session, chatLoading, id]);

  const handleClearChat = useCallback(async () => {
    await clearChatHistory(id);
    setChatMessages([]);
  }, [id]);

  // ── Background compaction ─────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    const total = session.tasks?.length ?? 0;
    const done = Object.values(statuses).filter((s) => s === "done").length;
    if (done !== total || total === 0 || isRunning) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    getCompactionStatus(id)
      .then((s) => {
        if (s.status === "done") {
          setCompactionStatus("done");
          return;
        }
        setCompactionStatus("running");
        triggerCompaction(id).catch(() => {});
        interval = setInterval(() => {
          getCompactionStatus(id)
            .then((res) => {
              setCompactionStatus(res.status);
              if (res.status === "done" && interval) {
                clearInterval(interval);
                interval = null;
              }
            })
            .catch(() => {
              if (interval) clearInterval(interval);
              interval = null;
            });
        }, 2000);
      })
      .catch(() => {});

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session, statuses, isRunning, id]);

  if (loading) {
    return <SessionSkeleton />;
  }

  if (!session) return null;

  const tasks: Task[] = session.tasks;
  const doneCount = Object.values(statuses).filter((s) => s === "done").length;
  const total = tasks.length;
  const allDone = doneCount === total && total > 0 && !isRunning;
  const exportMarkdown = () => {
    const lines = [
      `# ${session.topic} - 리서치 결과`,
      `> 생성일: ${new Date(session.createdAt).toLocaleString("ko-KR")}`,
      "",
    ];
    for (const task of tasks) {
      lines.push(`## ${task.icon} ${task.title}`);
      lines.push(results[task.id] ?? "*(미완료)*");
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.topic.replace(/\s+/g, "_")}_리서치.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      <SessionHeader
        topic={session.topic}
        model={session.model}
        isRunning={isRunning}
        allDone={allDone}
        onRunAll={handleRunAll}
        onCancel={handleCancel}
        onExport={exportMarkdown}
        onViewDetail={() => router.push(`/sessions/${id}/detail`)}
      />

      {/* Scrollable content */}
      <div className="bg-grey flex-1 overflow-y-auto px-8 py-6">
        <SummarySection sessionId={id} topic={session.topic} localModels={models.filter((m) => m.provider === "ollama")} allDone={allDone} />

        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              status={statuses[task.id] ?? "idle"}
              phase={phases[task.id]}
              result={results[task.id]}
              sources={sources[task.id]}
              onRun={() => handleRunTask(task)}
              onCancel={handleCancel}
            />
          ))}
        </div>

        <ChatSection
          chatMessages={chatMessages}
          chatBottomRef={chatBottomRef}
          onClearChat={handleClearChat}
          compactionStatus={compactionStatus}
        />
      </div>

      {/* Bottom input */}
      <div className="px-8 py-4 border-t border-slate-100 bg-white shrink-0">
        <ChatInputArea
          onSend={handleChatSend}
          generating={chatLoading}
          apiModels={models.filter((m) => m.provider !== "ollama")}
          localModels={models.filter((m) => m.provider === "ollama")}
          defaultModel={session.model}
        />
      </div>
    </div>
  );
}
