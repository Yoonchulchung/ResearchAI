"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSessions, deleteSession } from "@/lib/api";
import { Session } from "@/types";

import { SettingsMenu } from "./SettingsMenu";
import { QueueWidget } from "./QueueWidget";


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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getSessions().then(setSessions).catch(() => {});
  }, [pathname]);

  const filteredSessions = searchQuery.trim()
    ? sessions.filter((s) => s.topic.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

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

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 flex flex-col h-screen bg-[var(--sidebar)] border-r border-slate-200 overflow-hidden transition-all duration-200">
        <div className="flex flex-col items-center gap-3 py-4">
          {/* Logo icon */}
          <div
            onClick={() => router.push("/sessions/new")}
            className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-sm font-bold cursor-pointer hover:bg-indigo-700 transition-colors"
          >
            AI
          </div>
          {/* Expand button */}
          <button
            onClick={() => setCollapsed(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="사이드바 펼치기"
          >
            ▶
          </button>
          {/* New session icon */}
          <button
            onClick={() => router.push("/sessions/new")}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-base font-bold transition-colors ${
              pathname === "/sessions/new"
                ? "bg-indigo-600 text-white"
                : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            }`}
            title="새 리서치"
          >
            +
          </button>
        </div>
        {/* Session dots */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1.5 py-2 min-h-0">
          {sessions.map((s) => {
            const done = s.doneCount ?? 0;
            const dotStatus: "idle" | "partial" | "done" =
              done > 0 ? "partial" : "idle";
            const isActive = currentId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isActive ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
                title={s.topic}
              >
                <StatusDot status={dotStatus} />
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 flex flex-col h-screen bg-[var(--sidebar)] border-r border-slate-200 overflow-hidden transition-all duration-200">
      {/* Logo */}
      <div className="px-4 py-5 flex items-center justify-between">
        <div
          onClick={() => router.push("/sessions/new")}
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
        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition-colors text-xs"
          title="사이드바 접기"
        >
          ◀
        </button>
      </div>

      {/* New session button */}
      <div className="px-3 py-3">
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

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="리서치 검색..."
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 placeholder-slate-300 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
          />
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-400 text-xs">
            세션이 없습니다
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-400 text-xs">
            '{searchQuery}'에 대한 결과가 없습니다
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              리서치 목록 ({filteredSessions.length}{searchQuery ? `/${sessions.length}` : ""})
            </div>
            <QueueWidget />
            {filteredSessions.map((s) => {
              const done = s.doneCount ?? 0;
              const dotStatus: "idle" | "partial" | "done" =
                done > 0 ? "partial" : "idle";
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
                      {done > 0 && ` · ${done}완료`}
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
      <SettingsMenu />
    </aside>
  );
}
