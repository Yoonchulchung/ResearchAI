"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export function SettingsMenu() {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showMenu]);

  return (
    <div className="px-3 py-3 border-t border-slate-100 shrink-0 relative">
      {showMenu && (
        <div
          className="absolute bottom-full left-0 right-0 mx-0 mb-1 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0">
                AI
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 leading-tight">AI 리서치</div>
                <div className="text-xs text-slate-400">Research System</div>
              </div>
            </div>
          </div>

          <div className="py-1">
            <button
              onClick={() => { setShowMenu(false); router.push("/settings/overview"); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-slate-400">⚙️</span>
                Overview
              </div>
              <span className="text-xs text-slate-300">⌘,</span>
            </button>

            <button
              onClick={() => { setShowMenu(false); router.push("/settings/pipeline"); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-slate-400"></span>
                파이프라인 테스트
              </div>
              <span className="text-xs text-slate-300">›</span>
            </button>

            <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <span className="text-slate-400">❓</span>
              도움 받기
            </button>
          </div>

          <div className="h-px bg-slate-100 mx-2" />

          <div className="py-1">
            <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <span className="text-slate-400">↗</span>
              피드백 보내기
            </button>
            <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <span className="text-slate-400">ℹ️</span>
              자세히 알아보기
            </button>
          </div>
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
          showMenu
            ? "bg-slate-100 text-slate-800"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        }`}
      >
        <span className="text-sm">⚙️</span>
        설정
      </button>

    </div>
  );
}
