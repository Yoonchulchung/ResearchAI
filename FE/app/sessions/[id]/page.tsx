"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession } from "@/lib/api";
import { Session, Task, TaskStatus, SearchSources } from "@/types";
import { TaskCard, type Phase } from "@/sessions/components/TaskCard";
import { TopicInput } from "@/components/TopicInput";
import { useResearchQueue } from "@/contexts/ResearchQueueContext";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [statuses, setStatuses] = useState<Record<string, TaskStatus>>({});
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, SearchSources>>({});
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");

  const { jobs: allJobs, enqueueSession, enqueueTask, cancelSession } = useResearchQueue();

  // Jobs belonging to this session
  const sessionJobs = useMemo(
    () => allJobs.filter((j) => j.sessionId === id),
    [allJobs, id],
  );

  // ── Load from DB on mount ───────────────────────────────────────────────

  useEffect(() => {
    getSession(id)
      .then((s) => {
        setSession(s);
        setStatuses(s.statuses);
        setResults(s.results);
        setSources(s.sources ?? {});
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  // ── Sync queue state → local state ────────────────────────────────────

  useEffect(() => {
    for (const job of sessionJobs) {
      const key = String(job.taskId);

      if (job.status === "pending") {
        setStatuses((prev) =>
          prev[key] !== "queued" ? { ...prev, [key]: "queued" } : prev,
        );
      } else if (job.status === "running") {
        setStatuses((prev) =>
          prev[key] !== "loading" ? { ...prev, [key]: "loading" } : prev,
        );
        if (job.phase) {
          setPhases((prev) =>
            prev[key] !== job.phase ? { ...prev, [key]: job.phase! } : prev,
          );
        } else {
          setPhases((prev) => {
            if (!(key in prev)) return prev;
            const n = { ...prev };
            delete n[key];
            return n;
          });
        }
        if (job.sources) {
          setSources((prev) => ({ ...prev, [key]: job.sources! }));
        }
      } else if (job.status === "done") {
        setStatuses((prev) =>
          prev[key] !== "done" ? { ...prev, [key]: "done" } : prev,
        );
        setPhases((prev) => {
          if (!(key in prev)) return prev;
          const n = { ...prev };
          delete n[key];
          return n;
        });
        if (job.result) setResults((prev) => ({ ...prev, [key]: job.result! }));
        if (job.sources) setSources((prev) => ({ ...prev, [key]: job.sources! }));
      } else if (job.status === "error") {
        setStatuses((prev) =>
          prev[key] !== "error" ? { ...prev, [key]: "error" } : prev,
        );
        setPhases((prev) => {
          if (!(key in prev)) return prev;
          const n = { ...prev };
          delete n[key];
          return n;
        });
        if (job.result) setResults((prev) => ({ ...prev, [key]: job.result! }));
      }
    }
  }, [sessionJobs]);

  // ── Derived state ──────────────────────────────────────────────────────

  const isRunning = sessionJobs.some(
    (j) => j.status === "pending" || j.status === "running",
  );

  // ── Handlers ───────────────────────────────────────────────────────────

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
    setStatuses((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k] === "loading" || next[k] === "queued") {
          next[k] = "idle";
        }
      }
      return next;
    });
    setPhases({});
  }, [cancelSession, id]);

  // ── Export ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-3">⏳</div>
          <p>불러오는 중...</p>
        </div>
      </div>
    );
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
      {/* Sticky top bar */}
      <div className="px-8 py-2.5 pb-3.5 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="font-bold text-lg text-slate-800 truncate flex-1">
            {session.topic}
          </h1>
          <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-medium shrink-0">
            {session.model}
          </span>
          {allDone && (
            <button
              onClick={exportMarkdown}
              className="text-slate-500 hover:text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors shrink-0"
            >
              내보내기
            </button>
          )}
          {isRunning && (
            <button
              onClick={handleCancel}
              className="text-red-500 hover:text-red-600 font-bold text-sm px-4 py-2 rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50 transition-colors shrink-0"
            >
              ⏹ 중단
            </button>
          )}
          <button
            onClick={handleRunAll}
            disabled={isRunning || allDone}
            className="bg-indigo-600 text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isRunning ? "분석 중..." : allDone ? "완료" : "전체 실행"}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="bg-grey flex-1 overflow-y-auto px-8 py-6">
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
      </div>

      {/* Bottom input */}
      <div className="px-8 py-4 border-t border-slate-100 bg-white shrink-0">
        <TopicInput
          value={inputValue}
          onChange={setInputValue}
          onGenerate={() => {}}
          generating={false}
        />
      </div>
    </div>
  );
}
