"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Session } from "@/types";
import { markdownComponents } from "@/lib/markdown";
import { useTheme } from "@/contexts/ThemeContext";
import { ResearchChart, type ChartData } from "./ResearchChart";

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20] as const;
const DEFAULT_FONT_SIZE_IDX = 2; // 14px

const BG_COLORS = [
  { label: "흰색", value: "#FFFFFF" },
  { label: "크림", value: "#FAF8F4" },
  { label: "연한 노랑", value: "#FEFCE8" },
  { label: "연한 초록", value: "#F0FDF4" },
  { label: "연한 파랑", value: "#F0F9FF" },
  { label: "연한 회색", value: "#F8FAFC" },
];

const DARK_BG_COLORS = [
  { label: "슬레이트", value: "#1e293b" },
  { label: "딥 블루", value: "#0f2233" },
  { label: "차콜", value: "#1a1a2e" },
  { label: "그린 다크", value: "#0d2117" },
  { label: "어두운 회색", value: "#18181b" },
  { label: "진한 슬레이트", value: "#0f172a" },
];

interface Props {
  session: Session;
  sessionId: string;
  expanded?: boolean;
  selectedTaskId?: number | null;
  instantScroll?: boolean;
  aiResults?: Record<string, string>;
  onExpand?: () => void;
  onClose: () => void;
}

export function DetailPanel({ session, sessionId, expanded, selectedTaskId, instantScroll, aiResults, onExpand, onClose }: Props) {
  const { theme } = useTheme();
  const doneTasks = (session.items ?? [])
    .map((t) => ({ ...t, aiResult: aiResults?.[String(t.id)] ?? t.aiResult }))
    .filter((t) => t.aiResult);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRatioRef = useRef(0); // 두 effect가 공유하는 스크롤 비율
  const [fontSizeIdx, setFontSizeIdx] = useState(() => {
    try {
      const v = localStorage.getItem("viewer_font_size_idx");
      if (v !== null) {
        const idx = parseInt(v, 10);
        if (!isNaN(idx) && idx >= 0 && idx < FONT_SIZES.length) return idx;
      }
    } catch { }
    return DEFAULT_FONT_SIZE_IDX;
  });
  const fontSize = FONT_SIZES[fontSizeIdx];
  const [bgColor, setBgColor] = useState(() => {
    try { return localStorage.getItem("viewer_bg_color") ?? BG_COLORS[1].value; } catch { }
    return BG_COLORS[1].value;
  });
  const [darkBgColor, setDarkBgColor] = useState(() => {
    try { return localStorage.getItem("viewer_dark_bg_color") ?? DARK_BG_COLORS[0].value; } catch { }
    return DARK_BG_COLORS[0].value;
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePalette = theme === "dark" ? DARK_BG_COLORS : BG_COLORS;
  const activeColor = theme === "dark" ? darkBgColor : bgColor;

  // selectedTaskId 변경 시 해당 섹션으로 스크롤
  useEffect(() => {
    if (!selectedTaskId) return;
    const delay = instantScroll ? 0 : 380;
    const timer = setTimeout(() => {
      const scrollEl = scrollRef.current;
      const targetEl = document.getElementById(`detail-task-${selectedTaskId}`);
      if (!scrollEl || !targetEl) return;

      const newTop = Math.max(
        0,
        targetEl.getBoundingClientRect().top -
          scrollEl.getBoundingClientRect().top +
          scrollEl.scrollTop -
          8,
      );

      scrollEl.scrollTo({ top: newTop, behavior: instantScroll ? "auto" : "smooth" });

      // ratio ref 업데이트 — 이후 ResizeObserver 복원이 덮어쓰지 않도록
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (max > 0) {
        scrollRatioRef.current = newTop / max;
        sessionStorage.setItem(`detail-scroll-ratio:${sessionId}`, String(scrollRatioRef.current));
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [selectedTaskId, instantScroll, doneTasks.length, sessionId]);

  // 스크롤 위치를 비율(ratio)로 저장/복원 — 폭이 달라져 reflow돼도 같은 지점을 가리킴
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let ignoreScrollUntil = 0;
    let lastScrollTime = 0;
    let ratioSaveTimer: ReturnType<typeof setTimeout> | null = null;

    const saveRatio = () => {
      lastScrollTime = performance.now();
      if (performance.now() < ignoreScrollUntil) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) {
        scrollRatioRef.current = el.scrollTop / max;
        if (ratioSaveTimer) clearTimeout(ratioSaveTimer);
        ratioSaveTimer = setTimeout(() => {
          sessionStorage.setItem(`detail-scroll-ratio:${sessionId}`, String(scrollRatioRef.current));
        }, 150);
      }
    };

    const restoreToRatio = () => {
      // 사용자가 스크롤 중이면 건너뜀
      if (performance.now() - lastScrollTime < 300) return;
      ignoreScrollUntil = performance.now() + 200;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = scrollRatioRef.current * max;
    };

    el.addEventListener("scroll", saveRatio, { passive: true });

    // 초기 복원 — 콘텐츠(ReactMarkdown) 렌더 완료 후
    const saved = sessionStorage.getItem(`detail-scroll-ratio:${sessionId}`);
    if (saved) {
      scrollRatioRef.current = Number(saved);
      requestAnimationFrame(() => { requestAnimationFrame(restoreToRatio); });
    }

    // 폭 변화(데스크탑 ↔ 모바일) 시 동일 비율로 재복원
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(restoreToRatio);
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", saveRatio);
      ro.disconnect();
      if (ratioSaveTimer) clearTimeout(ratioSaveTimer);
    };
  }, [sessionId]);

  // 변경 시 debounce 저장
  const save = (key: string, value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { try { localStorage.setItem(key, value); } catch { } }, 300);
  };

  const handleFontSizeIdx = (idx: number) => {
    setFontSizeIdx(idx);
    save("viewer_font_size_idx", String(idx));
  };

  const handleBgColor = (color: string) => {
    if (theme === "dark") {
      setDarkBgColor(color);
      save("viewer_dark_bg_color", color);
    } else {
      setBgColor(color);
      save("viewer_bg_color", color);
    }
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ backgroundColor: activeColor }}>
      <div className="px-6 py-3.5 flex items-center justify-between gap-4 shrink-0 border-b border-black/[0.06] dark:border-white/[0.08]">
        {/* Left: Title & Count */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h2 className="font-semibold text-[15px] text-slate-800 dark:text-slate-100 truncate tracking-tight">
            {session.topic}
          </h2>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Theme Palette */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-black/[0.06] dark:border-white/[0.06]">
            {activePalette.map((c) => (
              <button
                key={c.value}
                onClick={() => handleBgColor(c.value)}
                title={c.label}
                className="w-4 h-4 rounded m-0.5 border border-black/10 transition-transform hover:scale-110 flex items-center justify-center shadow-sm"
                style={{ backgroundColor: c.value }}
              >
                {activeColor === c.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40" />
                )}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-black/[0.08] dark:bg-white/[0.08] mx-1" />

          {/* Font Size */}
          <div className="flex items-center bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-black/[0.06] dark:border-white/[0.06] p-0.5">
            <button
              onClick={() => handleFontSizeIdx(Math.max(0, fontSizeIdx - 1))}
              disabled={fontSizeIdx === 0}
              className="w-7 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-all disabled:opacity-30"
              title="글자 작게"
            >
              <span className="text-[11px] font-medium tracking-tighter">A-</span>
            </button>
            <span className="w-6 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {fontSize}
            </span>
            <button
              onClick={() => handleFontSizeIdx(Math.min(FONT_SIZES.length - 1, fontSizeIdx + 1))}
              disabled={fontSizeIdx === FONT_SIZES.length - 1}
              className="w-7 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-all disabled:opacity-30"
              title="글자 크게"
            >
              <span className="text-[11px] font-medium tracking-tighter">A+</span>
            </button>
          </div>

          <div className="w-px h-5 bg-black/[0.08] dark:bg-white/[0.08] mx-1" />

          {/* Window Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={onExpand}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] rounded-md transition-all"
              title={expanded ? "축소" : "전체 보기"}
            >
              {expanded ? (
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5.5 1.5H1.5V5.5M9.5 1.5H13.5V5.5M5.5 13.5H1.5V9.5M9.5 13.5H13.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1.5 5.5V1.5H5.5M13.5 5.5V1.5H9.5M1.5 9.5V13.5H5.5M13.5 9.5V13.5H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
              title="닫기"
            >
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6" style={{ fontSize, overflowAnchor: "none" }}>
        {doneTasks.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-16">
            완료된 리서치 항목이 없습니다.
          </p>
        ) : (
          <div className="space-y-8">
            {doneTasks.map((task) => (
              <section key={task.id} id={`detail-task-${task.id}`}>
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2" style={{ fontSize }}>
                  {task.title}
                </h3>
                <div className="prose prose-slate max-w-none
                  [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:my-4
                  tracking-wide
                  [&_th]:bg-slate-100 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
                  [&_td]:px-4 [&_td]:py-3 [&_td]:border [&_td]:border-slate-200
                  [&_tr:nth-child(even)]:bg-white [&_tr:nth-child(odd)]:bg-slate-50/50
                  [&_h1]:font-bold [&_h1]:text-2xl [&_h1]:mt-10 [&_h1]:mb-5 [&_h1]:pb-2 [&_h1]:border-b-2 [&_h1]:border-slate-800 [&_h1]:text-slate-900
                  [&_h2]:font-bold [&_h2]:text-xl [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:pl-3 [&_h2]:border-l-4 [&_h2]:border-indigo-600 [&_h2]:text-slate-800
                  [&_h3]:font-bold [&_h3]:text-lg [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-slate-800
                  [&_h4]:font-bold [&_h4]:text-base [&_h4]:mt-5 [&_h4]:mb-3 [&_h4]:text-slate-800
                  [&_strong]:font-bold [&_strong]:text-slate-900
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-3
                  [&_li]:my-0.5 [&_li]:text-slate-700 [&_li]:leading-relaxed
                  [&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-slate-700
                  [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700 [&_code]:font-mono
                  [&_blockquote]:bg-slate-50 [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-400 [&_blockquote]:p-3 [&_blockquote]:my-4 [&_blockquote]:not-italic [&_blockquote]:text-slate-700 [&_blockquote]:rounded-r-lg [&_blockquote_p]:m-0
                  [&_hr]:border-slate-200 [&_hr]:my-6">
                  {task.chartData && Array.isArray(task.chartData) && task.chartData.length > 0 && (
                    <ResearchChart chartData={task.chartData as ChartData[]} />
                  )}
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{task.aiResult ?? ""}</ReactMarkdown>
                </div>
                <div className="mt-6 border-b border-slate-100" />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
