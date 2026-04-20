"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1.5V3M7 11V12.5M1.5 7H3M11 7H12.5M3.22 3.22L4.27 4.27M9.73 9.73L10.78 10.78M3.22 10.78L4.27 9.73M9.73 4.27L10.78 3.22" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5V10.5C2 10.78 2.22 11 2.5 11H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M8.5 4.5L11 6.5L8.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 6.5H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function UserAvatar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-white text-sm font-semibold">
      {initial}
    </div>
  );
}

export function SettingsMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showMenu]);

  const handleLogout = () => {
    logout();
    setShowMenu(false);
    router.push("/login");
  };

  const menuItems = [
    { label: "Overview", path: "/settings/overview", shortcut: "⌘," },
    { label: "Analytics", path: "/settings/analytics" },
    { label: "파이프라인 테스트", path: "/settings/pipeline" },
    { label: "시스템", path: "/settings/system" },
    { label: "배경화면", path: "/settings/background" },
  ];

  return (
    <div className="px-3 py-3 border-t border-slate-100 shrink-0 relative">
      {showMenu && (
        <div
          className="absolute bottom-full left-2 right-2 mb-1.5 bg-white rounded-xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3.5 py-3 border-b border-slate-100">
            {user ? (
              <div className="flex items-center gap-2.5">
                <UserAvatar username={user.username} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 leading-tight truncate">{user.username}</div>
                  <div className="text-2xs text-slate-400">Pro 요금제</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                    <path d="M8 20V9H13.5C15.433 9 17 10.567 17 12.5C17 14.433 15.433 16 13.5 16H8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 16L18 20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800 leading-tight">ResearchAI</div>
                  <div className="text-2xs text-slate-400">AI Research Platform</div>
                </div>
              </div>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {menuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => { setShowMenu(false); router.push(item.path); }}
                className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="text-2xs text-slate-300 font-mono">{item.shortcut}</span>
                )}
              </button>
            ))}
          </div>

          <div className="h-px bg-slate-100 mx-2" />

          <div className="py-1">
            {user ? (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                <IconLogout />
                로그아웃
              </button>
            ) : (
              <button
                onClick={() => { setShowMenu(false); router.push("/login"); }}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span className="text-slate-400">→</span>
                로그인
              </button>
            )}
            <button className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
              <span className="text-slate-400">?</span>
              자세히 알아보기
            </button>
          </div>
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all ${
          showMenu
            ? "bg-slate-100"
            : "hover:bg-slate-50"
        }`}
      >
        {user ? (
          <>
            <UserAvatar username={user.username} />
            <div className="min-w-0 text-left">
              <div className="text-xs font-semibold text-slate-800 truncate leading-tight">{user.username}</div>
              <div className="text-2xs text-slate-400 leading-tight">Pro 요금제</div>
            </div>
          </>
        ) : (
          <>
            <IconSettings />
            <span className="text-xs font-medium text-slate-500">설정</span>
          </>
        )}
      </button>
    </div>
  );
}
