"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, searchPipeline, runResearch, saveTaskResult } from "../../lib/api";
import { Session, Task, TaskStatus, SearchSources } from "../../types";
import { TaskCard, type Phase } from "../components/TaskCard";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [statuses, setStatuses] = useState<Record<string, TaskStatus>>({});
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, SearchSources>>({});
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

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

  const cancel = useCallback(() => {
    runningRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setStatuses((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k] === "loading") next[k] = "idle" as TaskStatus;
      }
      return next;
    });
    setPhases({});
  }, []);

  const runTask = useCallback(
    async (task: Task, signal?: AbortSignal) => {
      if (!session) return;

      // ── 1단계: 검색 파이프라인 ──────────────────────────────────────────────
      setStatuses((s) => ({ ...s, [task.id]: "loading" }));
      setPhases((p) => ({ ...p, [task.id]: "searching" }));

      let context = "";
      try {
        const { sources: taskSources, context: ctx } = await searchPipeline(task.prompt, signal);
        context = ctx;
        if (taskSources && Object.keys(taskSources).length > 0) {
          setSources((s) => ({ ...s, [task.id]: taskSources }));
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          setStatuses((s) => ({ ...s, [task.id]: "idle" }));
          setPhases((p) => { const n = { ...p }; delete n[task.id]; return n; });
          return;
        }
        // 검색 실패는 무시하고 AI 단계로 진행
      }

      if (signal?.aborted) {
        setStatuses((s) => ({ ...s, [task.id]: "idle" }));
        setPhases((p) => { const n = { ...p }; delete n[task.id]; return n; });
        return;
      }

      // ── 2단계: AI 분석 ───────────────────────────────────────────────────────
      setPhases((p) => ({ ...p, [task.id]: "analyzing" }));

      try {
        const { result } = await runResearch(task.prompt, session.model, context || undefined, signal);
        setResults((r) => ({ ...r, [task.id]: result }));
        setStatuses((s) => ({ ...s, [task.id]: "done" }));
        setPhases((p) => { const n = { ...p }; delete n[task.id]; return n; });
        const savedSources = sources[task.id] ?? (context ? undefined : undefined);
        await saveTaskResult(id, task.id, result, "done", savedSources);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          setStatuses((s) => ({ ...s, [task.id]: "idle" }));
          setPhases((p) => { const n = { ...p }; delete n[task.id]; return n; });
          return;
        }
        const msg = e instanceof Error ? e.message : "오류";
        setResults((r) => ({ ...r, [task.id]: msg }));
        setStatuses((s) => ({ ...s, [task.id]: "error" }));
        setPhases((p) => { const n = { ...p }; delete n[task.id]; return n; });
        await saveTaskResult(id, task.id, msg, "error");
      }
    },
    [id, session, sources]
  );

  const handleRunTask = useCallback(
    async (task: Task) => {
      const controller = new AbortController();
      abortRef.current = controller;
      await runTask(task, controller.signal);
      if (abortRef.current === controller) abortRef.current = null;
    },
    [runTask]
  );

  const runAll = async () => {
    if (!session) return;
    setRunning(true);
    runningRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    for (const task of session.tasks) {
      if (!runningRef.current || controller.signal.aborted) break;
      if (statuses[task.id] !== "done") {
        await runTask(task, controller.signal);
      }
    }

    if (runningRef.current) {
      setRunning(false);
      runningRef.current = false;
    }
    if (abortRef.current === controller) abortRef.current = null;
  };

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
  const progress = total > 0 ? (doneCount / total) * 100 : 0;
  const allDone = doneCount === total && total > 0;

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
      <div className="px-8 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
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
          {running && (
            <button
              onClick={cancel}
              className="text-red-500 hover:text-red-600 font-bold text-sm px-4 py-2 rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50 transition-colors shrink-0"
            >
              ⏹ 중단
            </button>
          )}
          <button
            onClick={runAll}
            disabled={running || allDone}
            className="bg-indigo-600 text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {running ? "분석 중..." : allDone ? "완료" : "전체 실행"}
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 shrink-0">
            {doneCount} / {total} 완료
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6 max-w-xs">
          {[
            {
              label: "대기",
              val: Object.values(statuses).filter((s) => s === "idle").length,
              cls: "bg-slate-100 text-slate-600",
            },
            {
              label: "분석 중",
              val: Object.values(statuses).filter((s) => s === "loading").length,
              cls: "bg-indigo-50 text-indigo-600",
            },
            {
              label: "완료",
              val: doneCount,
              cls: "bg-green-50 text-green-700",
            },
          ].map((s) => (
            <div key={s.label} className={`${s.cls} rounded-2xl p-3 text-center`}>
              <div className="text-xl font-bold">{s.val}</div>
              <div className="text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Task list */}
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
              onCancel={cancel}
            />
          ))}
        </div>

        {/* Completion message */}
        {allDone && (
          <div className="mt-6 bg-linear-to-r from-indigo-600 to-indigo-500 rounded-2xl p-6 text-white text-center shadow-lg shadow-indigo-200">
            <div className="text-3xl mb-2">🎉</div>
            <div className="font-bold text-lg mb-1">전체 리서치 완료!</div>
            <div className="text-indigo-200 text-sm mb-4">
              {total}개 항목 분석이 완료되었습니다
            </div>
            <button
              onClick={exportMarkdown}
              className="bg-white text-indigo-700 font-bold px-6 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors text-sm"
            >
              📥 마크다운으로 내보내기
            </button>
          </div>
        )}

        <p className="text-center text-slate-300 text-xs mt-8">
          Powered by {session.model} · Real-time Web Search
        </p>
      </div>
    </div>
  );
}
