"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSessions, deleteSession } from "../lib/api";
import { Session, TaskStatus } from "../types";

type SessionSummary = Omit<Session, "results"> & { doneCount: number };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusDot({ status }: { status: "idle" | "partial" | "done" }) {
  const cls = {
    idle: "bg-slate-300",
    partial: "bg-blue-400",
    done: "bg-green-400",
  }[status];
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getSessions().then(setSessions).catch(() => {});
  }, [pathname]);

  const currentId = pathname.startsWith("/sessions/")
    ? pathname.split("/sessions/")[1]
    : null;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("이 리서치 세션을 삭제할까요?")) return;
    setDeletingId(id);
    await deleteSession(id);
    setSessions((s) => s.filter((x) => x.id !== id));
    setDeletingId(null);
    if (currentId === id) router.push("/");
  };

  return (
    <aside className="w-64 shrink-0 flex flex-col h-screen bg-white border-r border-slate-200 overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-100">
        <div
          onClick={() => router.push("/")}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">
            AI
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 leading-tight">
              AI 리서치
            </div>
            <div className="text-[10px] text-slate-400">Research System</div>
          </div>
        </div>
      </div>

      {/* New session button */}
      <div className="px-3 py-3 border-b border-slate-100">
        <button
          onClick={() => router.push("/sessions/new")}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            pathname === "/sessions/new"
              ? "bg-indigo-600 text-white"
              : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          }`}
        >
          <span className="text-base leading-none">+</span>
          새 리서치
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-400 text-xs">
            세션이 없습니다
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              리서치 목록 ({sessions.length})
            </div>
            {sessions.map((s) => {
              const total = s.tasks.length;
              const done = s.doneCount;
              const dotStatus: "idle" | "partial" | "done" =
                done === total && total > 0
                  ? "done"
                  : done > 0
                  ? "partial"
                  : "idle";
              const isActive = currentId === s.id;

              return (
                <div
                  key={s.id}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                  className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <StatusDot status={dotStatus} />
                  <div className="flex-1 min-w-0 pt-px">
                    <div
                      className={`text-xs font-semibold truncate leading-snug ${
                        isActive ? "text-indigo-700" : "text-slate-700"
                      }`}
                    >
                      {s.topic}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {formatDate(s.createdAt)}
                      {total > 0 && ` · ${done}/${total}`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, s.id)}
                    disabled={deletingId === s.id}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all p-0.5 shrink-0 mt-px"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Settings */}
      <div className="px-3 py-3 border-t border-slate-100 shrink-0">
        <button
          onClick={() => router.push("/settings")}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
            pathname === "/settings"
              ? "bg-slate-100 text-slate-800"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          }`}
        >
          <span className="text-sm">⚙️</span>
          Setting
        </button>
      </div>
    </aside>
  );
}
