"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSessions, deleteSession } from "@/lib/api";
import { Session } from "@/types";

import { SettingsMenu } from "./SettingsMenu";
import { QueueWidget } from "./QueueWidget";
import { useNewSessionModal } from "@/contexts/NewSessionModalContext";
import { useDocStoreModal } from "@/contexts/DocStoreModalContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTheme } from "@/contexts/ThemeContext";


function formatDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 24) {
    return date.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays < 7) {
    return date.toLocaleString("ko-KR", { month: "short", day: "numeric" });
  } else {
    return date.toLocaleString("ko-KR", { month: "short", day: "numeric" });
  }
}

type DotStatus = "idle" | "partial" | "done" | "running";

function StatusDot({ status }: { status: DotStatus }) {
  if (status === "running") {
    return (
      <span className="relative flex w-2 h-2 shrink-0 mt-0.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
        <span className="relative inline-flex rounded-full w-2 h-2 bg-indigo-500" />
      </span>
    );
  }
  const cls = {
    idle: "bg-slate-300",
    partial: "bg-amber-400",
    done: "bg-emerald-400",
  }[status] ?? "bg-slate-300";
  return <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${cls}`} />;
}

// Inline SVG Icons
function IconResearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconDocument() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M9 2H4C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 4 14H12C12.5523 14 13 13.5523 13 13V6L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 2V6H13" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 9H10M6 11.5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9.5 4L12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconBookmark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M4 2H12C12.55 2 13 2.45 13 3V14L8 11L3 14V3C3 2.45 3.45 2 4 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 6H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className="shrink-0">
      <rect width="28" height="28" rx="7" fill="#4F46E5"/>
      <path d="M8 20V9H13.5C15.433 9 17 10.567 17 12.5C17 14.433 15.433 16 13.5 16H8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 16L18 20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}


const COLLAPSE_BREAKPOINT = 1024; // px — 이 너비 이하에서 자동 축소

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { openModal } = useNewSessionModal();
  const { openModal: openDocStore } = useDocStoreModal();
  const { setCollapsed: setSidebarCollapsed } = useSidebar();
  const { uiStyle } = useTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const updateCollapsed = useCallback((v: boolean) => {
    setCollapsed(v);
    setSidebarCollapsed(v);
  }, [setSidebarCollapsed]);

  // 반응형: 창 너비에 따라 자동 축소/확장
  useEffect(() => {
    const handleResize = () => {
      updateCollapsed(window.innerWidth < COLLAPSE_BREAKPOINT);
    };
    handleResize(); // 초기 실행
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateCollapsed]);

  const fetchSessions = useCallback(() => {
    getSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [pathname, fetchSessions]);

  // WebSocket으로 세션 상태 실시간 업데이트
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket("ws://localhost:3001/ws");

      ws.onopen = () => {
        ws!.send(JSON.stringify({ event: "subscribe:sessions" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.event === "session:update" && msg.data) {
            setSessions((prev) =>
              prev.map((s) => (s.id === msg.data.id ? msg.data : s))
            );
          }
        } catch {
          // 파싱 오류 무시
        }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

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

  const containerClasses = uiStyle === "glass"
    ? "m-3 mr-0 h-[calc(100vh-1.5rem)] rounded-2xl glass-panel shadow-lg"
    : "h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800";

  if (collapsed) {
    return (
      <aside className={`w-13 shrink-0 flex flex-col overflow-hidden transition-all duration-300 z-10 ${containerClasses}`}>
        <div className="flex flex-col items-center gap-1 pt-4 pb-2 px-2">
          <button
            onClick={() => router.push("/")}
            className="w-8 h-8 flex items-center justify-center mb-1"
            title="홈"
          >
            <LogoMark size={28} />
          </button>
          <button
            onClick={() => updateCollapsed(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="사이드바 펼치기"
          >
            <IconChevronRight />
          </button>
          <div className="w-6 h-px bg-slate-200 my-1" />
          <button
            onClick={openModal}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
            title="새 리서치"
          >
            <IconPlus />
          </button>
          <button
            onClick={() => router.push("/doc-parse")}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${
              pathname === "/doc-parse"
                ? "bg-brand-primary text-white shadow-md shadow-brand-primary/30"
                : "text-slate-500 hover:bg-slate-500/10 hover:text-brand-primary"
            }`}
            title="문서 파싱"
          >
            <IconDocument />
          </button>
          <button
            onClick={() => router.push("/doc-write")}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${
              pathname === "/doc-write"
                ? "bg-brand-primary text-white shadow-md shadow-brand-primary/30"
                : "text-slate-500 hover:bg-slate-500/10 hover:text-brand-primary"
            }`}
            title="문서 작성"
          >
            <IconPencil />
          </button>
          <button
            onClick={openDocStore}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-500/10 hover:text-brand-primary"
            title="문서 저장"
          >
            <IconBookmark />
          </button>
        </div>
        {/* Session dots */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 py-2 px-2 min-h-0">
          {sessions.map((s) => {
            const isRunning = s.researchState === "running" || s.researchState === "pending";
            const done = s.doneCount ?? 0;
            const dotStatus: DotStatus = isRunning ? "running" : done > 0 ? "partial" : "idle";
            const isActive = currentId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isActive ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"
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
    <aside className={`w-60 shrink-0 flex flex-col overflow-hidden transition-all duration-300 z-10 ${containerClasses}`}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2.5 group min-w-0"
        >
          <LogoMark size={26} />
          <div className="min-w-0">
            <div className="text-xs2 font-bold text-slate-800 leading-tight tracking-tight">
              ResearchAI
            </div>
            <div className="text-2xs text-slate-400 leading-tight">AI Research Platform</div>
          </div>
        </button>
        <button
          onClick={() => updateCollapsed(true)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition-colors"
          title="사이드바 접기"
        >
          <IconChevronLeft />
        </button>
      </div>

      {/* Primary Actions */}
      <div className="px-3 pb-3 space-y-1">
        <button
          onClick={openModal}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        >
          <IconPlus />
          새 리서치
        </button>
        <button
          onClick={() => router.push("/doc-parse")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            pathname === "/doc-parse"
              ? "bg-brand-primary text-white shadow-md shadow-brand-primary/30"
              : "text-slate-600 hover:bg-slate-500/5 hover:text-brand-primary"
          }`}
        >
          <IconDocument />
          문서 파싱
        </button>
        <button
          onClick={() => router.push("/doc-write")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            pathname === "/doc-write"
              ? "bg-brand-primary text-white shadow-md shadow-brand-primary/30"
              : "text-slate-600 hover:bg-slate-500/5 hover:text-brand-primary"
          }`}
        >
          <IconPencil />
          문서 작성
        </button>
        <button
          onClick={openDocStore}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-slate-600 hover:bg-slate-500/5 hover:text-brand-primary"
        >
          <IconBookmark />
          문서 저장
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-slate-100 mb-3" />

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <IconResearch />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="세션 검색..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 placeholder-slate-400 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 transition-all"
          />
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
              <IconResearch />
            </div>
            <p className="text-xs text-slate-400">리서치 세션이 없습니다</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-400 text-xs">
            &apos;{searchQuery}&apos;에 대한 결과가 없습니다
          </div>
        ) : (
          <div className="px-2 pb-2">
            <div className="px-2 py-1.5 text-2xs font-semibold text-slate-400 uppercase tracking-widest flex items-center justify-between">
              <span>리서치</span>
              <span className="text-slate-300 font-normal normal-case tracking-normal">
                {filteredSessions.length}{searchQuery ? `/${sessions.length}` : ""}
              </span>
            </div>
            <QueueWidget />
            {filteredSessions.map((s) => {
              const isRunning = s.researchState === "running" || s.researchState === "pending";
              const done = s.doneCount ?? 0;
              const dotStatus: DotStatus = isRunning ? "running" : done > 0 ? "partial" : "idle";
              const isActive = currentId === s.id;

              return (
                <div
                  key={s.id}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                  className={`group relative flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                    isActive
                      ? "bg-indigo-50 border border-indigo-100"
                      : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <div className="mt-0.5">
                    <StatusDot status={dotStatus} />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <div
                      className={`text-xs font-medium truncate leading-snug ${
                        isActive ? "text-indigo-700" : "text-slate-700"
                      }`}
                    >
                      {s.topic}
                    </div>
                    <div className={`text-2xs mt-0.5 ${isActive ? "text-indigo-400" : "text-slate-400"}`}>
                      {formatDate(s.createdAt)}
                      {done > 0 && ` · ${done}개 완료`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, s.id)}
                    disabled={deletingId === s.id}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all text-xs"
                    title="삭제"
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
