"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSession, runResearch, saveTaskResult } from "../../lib/api";
import { Session, Task, TaskStatus } from "../../types";

function TaskCard({
  task,
  status,
  result,
  onRun,
}: {
  task: Task;
  status: TaskStatus;
  result?: string;
  onRun: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const borderColor = {
    done: "#22c55e",
    loading: "#6366f1",
    error: "#ef4444",
    idle: "#e2e8f0",
  }[status];

  const badgeStyle = {
    done: "bg-green-100 text-green-700",
    loading: "bg-indigo-100 text-indigo-700",
    error: "bg-red-100 text-red-700",
    idle: "bg-slate-100 text-slate-500",
  }[status];

  const badgeLabel = {
    done: "완료",
    loading: "분석 중",
    error: "오류",
    idle: "대기",
  }[status];

  const subText = {
    done: "✅ 완료 · 클릭하여 결과 보기",
    loading: "🔍 웹 검색 및 AI 분석 중...",
    error: "❌ 오류 발생",
    idle: "클릭하여 분석 시작",
  }[status];

  const handleCardClick = () => {
    if (status === "idle") onRun();
    else if (result) setExpanded((e) => !e);
  };

  return (
    <div
      style={{ borderColor }}
      className="border-2 rounded-2xl bg-white shadow-sm overflow-hidden transition-colors"
    >
      <div
        onClick={handleCardClick}
        style={{
          background: status === "loading" ? "#f0f0ff" : "#fff",
          cursor: status === "idle" || result ? "pointer" : "default",
        }}
        className="flex items-center gap-3 px-5 py-4"
      >
        <span className="text-2xl shrink-0">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm">
            {task.id}. {task.title}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{subText}</div>
        </div>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${badgeStyle}`}
        >
          {badgeLabel}
        </span>
      </div>
      {result && expanded && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 max-h-150 overflow-y-auto prose prose-sm prose-slate max-w-none
          [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
          [&_th]:bg-slate-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
          [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
          [&_tr:nth-child(even)]:bg-white [&_tr:nth-child(odd)]:bg-slate-50/50
          [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-slate-800
          [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-slate-800
          [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-slate-700
          [&_strong]:font-bold [&_strong]:text-slate-800
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
          [&_li]:my-0.5 [&_li]:text-slate-700
          [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-slate-700
          [&_code]:bg-slate-200 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700
          [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic
          [&_hr]:border-slate-200 [&_hr]:my-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [statuses, setStatuses] = useState<Record<string, TaskStatus>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession(id)
      .then((s) => {
        setSession(s);
        setStatuses(s.statuses);
        setResults(s.results);
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  const runTask = useCallback(
    async (task: Task) => {
      if (!session) return;
      setStatuses((s) => ({ ...s, [task.id]: "loading" }));
      try {
        const { result } = await runResearch(task.prompt, session.model);
        setResults((r) => ({ ...r, [task.id]: result }));
        setStatuses((s) => ({ ...s, [task.id]: "done" }));
        await saveTaskResult(id, task.id, result, "done");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "오류";
        setResults((r) => ({ ...r, [task.id]: msg }));
        setStatuses((s) => ({ ...s, [task.id]: "error" }));
        await saveTaskResult(id, task.id, msg, "error");
      }
    },
    [id, session]
  );

  const runAll = async () => {
    if (!session) return;
    setRunning(true);
    for (const task of session.tasks) {
      if (statuses[task.id] !== "done") {
        await runTask(task);
      }
    }
    setRunning(false);
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
              📥 내보내기
            </button>
          )}
          <button
            onClick={runAll}
            disabled={running || allDone}
            className="bg-indigo-600 text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {running ? "⏳ 분석 중..." : allDone ? "✅ 완료" : "🚀 전체 실행"}
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
              result={results[task.id]}
              onRun={() => runTask(task)}
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
