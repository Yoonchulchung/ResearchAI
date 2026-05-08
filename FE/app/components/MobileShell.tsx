"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useNewSessionModal } from "@/contexts/NewSessionModalContext";
import { useDocStoreModal } from "@/contexts/DocStoreModalContext";
import { getSessions, deleteSession } from "@/lib/api";
import { Session } from "@/types";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M3 9.5L11 3L19 9.5V19C19 19.55 18.55 20 18 20H14V14H8V20H4C3.45 20 3 19.55 3 19V9.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14.5 14.5L19 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M15 3.5L18.5 7L8 17.5H4.5V14L15 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 2.5V5M11 17V19.5M2.5 11H5M17 11H19.5M4.4 4.4L6.2 6.2M15.8 15.8L17.6 17.6M4.4 17.6L6.2 15.8M15.8 6.2L17.6 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 4V18M4 11H18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2.5 4H12.5M5.5 4V2.5H9.5V4M6 7V11M9 7V11M3.5 4L4 12.5H11L11.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusDot({ state }: { state: string }) {
  if (state === "running" || state === "pending") {
    return (
      <span className="relative flex w-2 h-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
        <span className="relative inline-flex rounded-full w-2 h-2 bg-indigo-500" />
      </span>
    );
  }
  return <span className={`w-2 h-2 rounded-full shrink-0 ${state === "done" ? "bg-emerald-400" : "bg-slate-300"}`} />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 24) return d.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("ko-KR", { month: "short", day: "numeric" });
}

// ─── Sessions Drawer ──────────────────────────────────────────────────────────

function SessionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark } = useMobileTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ drawerOpen: true }, "");
    const handlePopState = () => onClose();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [open, onClose]);

  const fetchSessions = useCallback(() => {
    getSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => { fetchSessions(); }, [pathname, fetchSessions]);

  const currentId = pathname.startsWith("/sessions/") ? pathname.split("/sessions/")[1] : null;

  const filtered = query.trim()
    ? sessions.filter((s) => s.topic.toLowerCase().includes(query.toLowerCase()))
    : sessions;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("이 리서치 세션을 삭제할까요?")) return;
    setDeletingId(id);
    await deleteSession(id);
    setSessions((s) => s.filter((x) => x.id !== id));
    setDeletingId(null);
  };

  const bg = isDark ? "bg-slate-900 text-white" : "bg-white text-slate-800";
  const border = isDark ? "border-white/10" : "border-slate-200";
  const inputCls = isDark ? "bg-white/10 border-white/15 text-white placeholder:text-white/40" : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400";

  return (
    <>
      {/* backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      {/* sheet */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl ${bg} shadow-2xl transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"}`}
        style={{ maxHeight: "80vh" }}>
        {/* handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className={`w-10 h-1 rounded-full ${isDark ? "bg-white/20" : "bg-slate-200"}`} />
        </div>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${border}`}>
          <span className="font-semibold text-sm">리서치 세션</span>
          <button onClick={onClose} className={isDark ? "text-white/50 hover:text-white" : "text-slate-400 hover:text-slate-600"}>
            <IconClose />
          </button>
        </div>
        {/* search */}
        <div className="px-4 py-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="세션 검색..."
            className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300/50 ${inputCls}`}
          />
        </div>
        {/* list */}
        <div className="overflow-y-auto px-3 pb-6" style={{ maxHeight: "calc(80vh - 140px)" }}>
          {filtered.length === 0 ? (
            <p className={`text-center py-8 text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>
              {query ? `'${query}'에 대한 결과 없음` : "리서치 세션이 없습니다"}
            </p>
          ) : (
            filtered.map((s) => {
              const isActive = currentId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => { router.push(`/sessions/${s.id}`); onClose(); }}
                  className={`group flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all mb-1 ${
                    isActive
                      ? isDark ? "bg-indigo-500/20 border border-indigo-500/30" : "bg-indigo-50 border border-indigo-100"
                      : isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="mt-1">
                    <StatusDot state={s.researchState ?? "idle"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isActive ? (isDark ? "text-indigo-300" : "text-indigo-700") : ""}`}>
                      {s.topic}
                    </div>
                    <div className={`text-xs mt-0.5 ${isDark ? "text-white/40" : "text-slate-400"}`}>
                      {formatDate(s.createdAt)}
                      {(s.doneCount ?? 0) > 0 && ` · ${s.doneCount}개 완료`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, s.id)}
                    disabled={deletingId === s.id}
                    className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all ${isDark ? "text-white/30 hover:text-red-400 hover:bg-red-500/10" : "text-slate-300 hover:text-red-400 hover:bg-red-50"}`}
                  >
                    <IconTrash />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ─── Internal theme hook ──────────────────────────────────────────────────────

function useMobileTheme() {
  const { theme } = useTheme();
  return { isDark: theme === "dark" };
}

// ─── Mobile Header ────────────────────────────────────────────────────────────

function MobileHeader({ title, onNewResearch }: { title: string; onNewResearch: () => void }) {
  const router = useRouter();
  const { isDark } = useMobileTheme();
  const bg = isDark ? "bg-slate-900/95 border-white/10" : "bg-white/95 border-slate-200";

  return (
    <header className={`sticky top-0 z-20 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between ${bg}`}>
      <button onClick={() => router.push("/main")} className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-sm shadow shadow-indigo-500/30">
          ◈
        </div>
        <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{title}</span>
      </button>
      <button
        onClick={onNewResearch}
        className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white shadow shadow-indigo-500/30 transition-colors"
      >
        <IconPlus />
      </button>
    </header>
  );
}

// ─── More Drawer ──────────────────────────────────────────────────────────────

function MoreDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { isDark } = useMobileTheme();
  const bg = isDark ? "bg-slate-900 text-white" : "bg-white text-slate-800";
  const border = isDark ? "border-white/10" : "border-slate-200";

  const items = [
    { label: "기업 분석", desc: "AI 기업 리서치", path: "/company-analysis", emoji: "🏢" },
    { label: "채용 공고", desc: "잡사이트 크롤링", path: "/job-posting", emoji: "💼" },
    { label: "자기소개서", desc: "AI 자소서 스크래핑", path: "/cover-letter", emoji: "📝" },
    { label: "문서 보관함", desc: "저장된 문서 관리", path: "/doc-store", emoji: "🗂️" },
    { label: "설정", desc: "계정 및 API 키", path: "/settings/overview", emoji: "⚙️" },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl ${bg} shadow-2xl transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"}`}>
        <div className="flex justify-center pt-3 pb-1">
          <div className={`w-10 h-1 rounded-full ${isDark ? "bg-white/20" : "bg-slate-200"}`} />
        </div>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${border}`}>
          <span className="font-semibold text-sm">더 보기</span>
          <button onClick={onClose} className={isDark ? "text-white/50 hover:text-white" : "text-slate-400 hover:text-slate-600"}>
            <IconClose />
          </button>
        </div>
        <div className="px-3 py-3 pb-safe" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          {items.map((item) => (
            <button
              key={item.path}
              onClick={() => { router.push(item.path); onClose(); }}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all mb-1 ${
                isDark ? "hover:bg-white/5 active:bg-white/10" : "hover:bg-slate-50 active:bg-slate-100"
              }`}
            >
              <span className="text-2xl w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 shrink-0">
                {item.emoji}
              </span>
              <div className="text-left">
                <div className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>{item.label}</div>
                <div className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{item.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Bottom Navigation ────────────────────────────────────────────────────────

type NavTab = "home" | "sessions" | "write" | "settings" | "more";

function BottomNav({ active, onSessions }: { active: NavTab; onSessions: () => void }) {
  const router = useRouter();
  const { isDark } = useMobileTheme();
  const bg = isDark ? "bg-slate-900/95 border-white/10" : "bg-white/95 border-slate-200";

  const items: { id: NavTab; icon: React.ReactNode; label: string; action: () => void }[] = [
    { id: "home", icon: <IconHome />, label: "홈", action: () => router.push("/main") },
    { id: "sessions", icon: <IconSearch />, label: "세션", action: onSessions },
    { id: "write", icon: <IconPencil />, label: "문서 작성", action: () => router.push("/doc-write") },
    { id: "settings", icon: <IconSettings />, label: "설정", action: () => router.push("/settings/overview") },
  ];

  return (
    <nav className={`border-t backdrop-blur-md ${bg}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              onClick={item.action}
              className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors ${
                isActive
                  ? "text-indigo-500"
                  : isDark ? "text-white/40 hover:text-white/70" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {item.icon}
              <span className="text-2xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Mobile Shell ─────────────────────────────────────────────────────────────

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/sessions/")) return "리서치 세션";
  if (pathname.startsWith("/doc-write")) return "문서 작성";
  if (pathname.startsWith("/doc-parse")) return "문서 파싱";
  if (pathname.startsWith("/doc-store")) return "문서 보관함";
  if (pathname.startsWith("/company-analysis")) return "기업 분석";
  if (pathname.startsWith("/job-posting")) return "채용 공고";
  if (pathname.startsWith("/cover-letter")) return "자기소개서";
  if (pathname.startsWith("/settings")) return "설정";
  return "ResearchAI";
}

function getActiveTab(pathname: string): NavTab {
  if (pathname.startsWith("/main") || pathname === "/") return "home";
  if (pathname.startsWith("/sessions")) return "sessions";
  if (pathname.startsWith("/doc-write") || pathname.startsWith("/doc-parse")) return "write";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/company-analysis") || pathname.startsWith("/job-posting") || pathname.startsWith("/cover-letter") || pathname.startsWith("/doc-store")) return "more";
  return "home";
}

// Swipe-navigable route order (sessions is a drawer, not a route)
const SWIPE_ROUTES = ["/main", "/doc-write", "/settings/overview"];

function getSwipeIndex(pathname: string): number {
  if (pathname.startsWith("/main") || pathname === "/" || pathname.startsWith("/sessions")) return 0;
  if (pathname.startsWith("/doc-write") || pathname.startsWith("/doc-parse")) return 1;
  if (pathname.startsWith("/settings")) return 2;
  return 0;
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark } = useMobileTheme();
  const { openModal } = useNewSessionModal();
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handleGestureStart = useCallback((x: number, y: number) => {
    dragStart.current = { x, y };
  }, []);

  const handleGestureEnd = useCallback((x: number, y: number) => {
    if (!dragStart.current) return;
    const deltaX = x - dragStart.current.x;
    const deltaY = y - dragStart.current.y;
    dragStart.current = null;

    // Must be clearly horizontal (≥80px, at least 1.5× more horizontal than vertical)
    if (Math.abs(deltaX) < 80 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

    const idx = getSwipeIndex(pathname);
    if (deltaX < 0) {
      const next = SWIPE_ROUTES[idx + 1];
      if (next) router.push(next);
    } else {
      const prev = SWIPE_ROUTES[idx - 1];
      if (prev) router.push(prev);
    }
  }, [pathname, router]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    handleGestureStart(e.touches[0].clientX, e.touches[0].clientY);
  }, [handleGestureStart]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    handleGestureEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }, [handleGestureEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleGestureStart(e.clientX, e.clientY);
  }, [handleGestureStart]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    handleGestureEnd(e.clientX, e.clientY);
  }, [handleGestureEnd]);

  const bg = isDark ? "bg-slate-950" : "bg-slate-50";

  return (
    <div className={`flex flex-col overflow-hidden ${bg}`} style={{ height: '100dvh' }}>
      <MobileHeader
        title={getPageTitle(pathname)}
        onNewResearch={openModal}
      />
      <main
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {children}
      </main>
      <BottomNav
        active={getActiveTab(pathname)}
        onSessions={() => setSessionsOpen(true)}
      />
      <SessionsDrawer open={sessionsOpen} onClose={() => setSessionsOpen(false)} />
    </div>
  );
}
