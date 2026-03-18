"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Session } from "@/types";
import { markdownComponents } from "@/lib/markdown";
import { getConfig, setConfig } from "@/lib/api";

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

interface Props {
  session: Session;
  expanded?: boolean;
  onExpand?: () => void;
  onClose: () => void;
}

export function DetailPanel({ session, expanded, onExpand, onClose }: Props) {
  const doneTasks = (session.items ?? []).filter((t) => t.aiResult);
  const [fontSizeIdx, setFontSizeIdx] = useState(DEFAULT_FONT_SIZE_IDX);
  const fontSize = FONT_SIZES[fontSizeIdx];
  const [bgColor, setBgColor] = useState(BG_COLORS[1].value);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 초기 로드
  useEffect(() => {
    getConfig().then((cfg) => {
      if (cfg.viewer_font_size_idx !== undefined) {
        const idx = parseInt(cfg.viewer_font_size_idx, 10);
        if (!isNaN(idx) && idx >= 0 && idx < FONT_SIZES.length) setFontSizeIdx(idx);
      }
      if (cfg.viewer_bg_color) setBgColor(cfg.viewer_bg_color);
    }).catch(() => {});
  }, []);

  // 변경 시 debounce 저장
  const save = (key: string, value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setConfig(key, value).catch(() => {}), 500);
  };

  const handleFontSizeIdx = (idx: number) => {
    setFontSizeIdx(idx);
    save("viewer_font_size_idx", String(idx));
  };

  const handleBgColor = (color: string) => {
    setBgColor(color);
    save("viewer_bg_color", color);
  };

  return (
    <div className={`flex flex-col h-full border-l border-slate-200 shrink-0 ${expanded ? "w-full" : "w-[52%]"}`} style={{ backgroundColor: bgColor }}>
      {/* Header */}
      <div className="px-6 py-3.5 border-b border-slate-200 flex items-center gap-3 shrink-0 bg-white">
        <h2 className="font-bold text-sm text-slate-800 truncate flex-1">{session.topic}</h2>
        <span className="text-xs text-slate-400 shrink-0">{doneTasks.length}건 완료</span>

        {/* 배경 색상 */}
        <div className="flex items-center gap-1 shrink-0">
          {BG_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => handleBgColor(c.value)}
              title={c.label}
              className="w-4 h-4 rounded-full border transition-all"
              style={{
                backgroundColor: c.value,
                borderColor: bgColor === c.value ? "#64748b" : "#cbd5e1",
                boxShadow: bgColor === c.value ? "0 0 0 1.5px #64748b" : undefined,
              }}
            />
          ))}
        </div>

        {/* 글자 크기 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleFontSizeIdx(Math.max(0, fontSizeIdx - 1))}
            disabled={fontSizeIdx === 0}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors leading-none px-1"
            title="글자 작게"
          >
            A<span className="text-micro align-sub">-</span>
          </button>
          <span className="text-xs text-slate-400 w-6 text-center">{fontSize}</span>
          <button
            onClick={() => handleFontSizeIdx(Math.min(FONT_SIZES.length - 1, fontSizeIdx + 1))}
            disabled={fontSizeIdx === FONT_SIZES.length - 1}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors leading-none px-1"
            title="글자 크게"
          >
            A<span className="text-[11px] align-sub">+</span>
          </button>
        </div>

        <button
          onClick={onExpand}
          className="text-slate-400 hover:text-slate-600 transition-colors leading-none shrink-0"
          title={expanded ? "축소" : "전체 보기"}
        >
          {expanded ? (
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.5 1.5H1.5V5.5M9.5 1.5H13.5V5.5M5.5 13.5H1.5V9.5M9.5 13.5H13.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.5 5.5V1.5H5.5M13.5 5.5V1.5H9.5M1.5 9.5V13.5H5.5M13.5 9.5V13.5H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none shrink-0"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6" style={{ fontSize }}>
        {doneTasks.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-16">
            완료된 리서치 항목이 없습니다.
          </p>
        ) : (
          <div className="space-y-8">
            {doneTasks.map((task) => (
              <section key={task.id}>
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2" style={{ fontSize }}>
                  {task.title}
                </h3>
                <div className="prose prose-slate max-w-none
                  [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                  [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
                  [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
                  [&_tr:nth-child(even)]:bg-white [&_tr:nth-child(odd)]:bg-slate-50/50
                  [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-slate-800
                  [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-slate-800
                  [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-slate-700
                  [&_strong]:font-bold [&_strong]:text-slate-800
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                  [&_li]:my-0.5 [&_li]:text-slate-700
                  [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-slate-700
                  [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700
                  [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic
                  [&_hr]:border-slate-200 [&_hr]:my-3">
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
