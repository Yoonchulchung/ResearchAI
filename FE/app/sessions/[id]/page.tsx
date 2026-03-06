"use client";

import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, getChatHistory, clearChatHistory, chatStream, getModels, triggerCompaction, getCompactionStatus } from "@/lib/api";
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

  const { jobs: allJobs, enqueueSession, enqueueTask, cancelSession } = useResearchQueue();

  const sessionJobs = useMemo(
    () => allJobs.filter((j) => j.sessionId === id),
    [allJobs, id],
  );

  useEffect(() => {
    getModels().then((m) => {
      setModels(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setSession(null);
    setChatMessages([]);
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

  const statuses = useMemo<Record<string, TaskStatus>>(() => {
    const base: Record<string, TaskStatus> = { ...(session?.statuses ?? {}) };
    for (const job of sessionJobs) {
      const key = String(job.taskId);
      if (job.status === "pending") base[key] = "queued";
      else if (job.status === "running") base[key] = "loading";
      else if (job.status === "done") base[key] = "done";
      else if (job.status === "error") base[key] = "error";
    }
    return base;
  }, [session, sessionJobs]);

  const phases = useMemo<Record<string, Phase>>(() => {
    const p: Record<string, Phase> = {};
    for (const job of sessionJobs) {
      if (job.status === "running" && job.phase) {
        p[String(job.taskId)] = job.phase;
      }
    }
    return p;
  }, [sessionJobs]);

  const results = useMemo<Record<string, string>>(() => {
    const base = { ...(session?.results ?? {}) };
    for (const job of sessionJobs) {
      if (job.result) base[String(job.taskId)] = job.result;
    }
    return base;
  }, [session, sessionJobs]);

  const sources = useMemo<Record<string, SearchSources>>(() => {
    const base = { ...(session?.sources ?? {}) };
    for (const job of sessionJobs) {
      if (job.sources) base[String(job.taskId)] = job.sources;
    }
    return base;
  }, [session, sessionJobs]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const isRunning = sessionJobs.some(
    (j) => j.status === "pending" || j.status === "running",
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRunAll = useCallback(() => {
    if (!session) return;
    const doneTaskIds = Object.entries(statuses)
      .filter(([, s]) => s === "done")
      .map(([k]) => Number(k));
    enqueueSession(id, session.topic, session.tasks, session.model, doneTaskIds);
  }, [session, statuses, id, enqueueSession]);

  const handleRunTask = useCallback(
    (task: Task) => {
      if (!session) return;
      enqueueTask(id, session.topic, task, session.model);
    },
    [session, id, enqueueTask],
  );

  const handleCancel = useCallback(() => {
    cancelSession(id);
  }, [cancelSession, id]);

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
  const localModel = models.find((m) => m.provider === "ollama")?.id ?? "";

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
        <SummarySection sessionId={id} localModel={localModel} allDone={allDone} />

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
