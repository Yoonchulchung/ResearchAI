"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_CLASS } from "../_constants";
import type { ToolbarAction } from "../_types";
import {
  IconBold, IconCode, IconH1, IconH2, IconH3,
  IconHr, IconItalic, IconLink, IconList, IconQuote,
} from "./icons";

// ─── Toolbar definition ───────────────────────────────────────────────────────

const TOOLBAR: ToolbarAction[] = [
  {
    icon: <IconBold />, title: "굵게 (⌘B)",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end) || "텍스트";
      return { value: `${text.slice(0, start)}**${sel}**${text.slice(end)}`, cursor: start + sel.length + 4 };
    },
  },
  {
    icon: <IconItalic />, title: "기울임 (⌘I)",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end) || "텍스트";
      return { value: `${text.slice(0, start)}_${sel}_${text.slice(end)}`, cursor: start + sel.length + 2 };
    },
  },
  { icon: null, title: "sep", fn: (t, s) => ({ value: t, cursor: s.start }) },
  {
    icon: <IconH1 />, title: "제목 1",
    fn: (text, { start }) => {
      const ls = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, ls)}# ${text.slice(ls)}`, cursor: ls + 2 };
    },
  },
  {
    icon: <IconH2 />, title: "제목 2",
    fn: (text, { start }) => {
      const ls = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, ls)}## ${text.slice(ls)}`, cursor: ls + 3 };
    },
  },
  {
    icon: <IconH3 />, title: "제목 3",
    fn: (text, { start }) => {
      const ls = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, ls)}### ${text.slice(ls)}`, cursor: ls + 4 };
    },
  },
  { icon: null, title: "sep", fn: (t, s) => ({ value: t, cursor: s.start }) },
  {
    icon: <IconList />, title: "목록",
    fn: (text, { start }) => {
      const ls = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, ls)}- ${text.slice(ls)}`, cursor: ls + 2 };
    },
  },
  {
    icon: <IconCode />, title: "코드",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end);
      if (sel.includes("\n")) {
        return { value: `${text.slice(0, start)}\n\`\`\`\n${sel || "코드"}\n\`\`\`\n${text.slice(end)}`, cursor: start + 5 };
      }
      return { value: `${text.slice(0, start)}\`${sel || "코드"}\`${text.slice(end)}`, cursor: start + (sel.length || 2) + 2 };
    },
  },
  {
    icon: <IconQuote />, title: "인용",
    fn: (text, { start }) => {
      const ls = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, ls)}> ${text.slice(ls)}`, cursor: ls + 2 };
    },
  },
  {
    icon: <IconLink />, title: "링크",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end) || "링크 텍스트";
      return { value: `${text.slice(0, start)}[${sel}](url)${text.slice(end)}`, cursor: start + sel.length + 3 };
    },
  },
  { icon: null, title: "sep", fn: (t, s) => ({ value: t, cursor: s.start }) },
  {
    icon: <IconHr />, title: "구분선",
    fn: (text, { start }) => ({
      value: `${text.slice(0, start)}\n---\n${text.slice(start)}`,
      cursor: start + 6,
    }),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  content: string;
  setContent: (v: string) => void;
  mode: "edit" | "preview";
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  words: number;
  chars: number;
  onTextareaSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  applyToolbar: (action: ToolbarAction) => void;
}

export function EditorPanel({
  content,
  setContent,
  mode,
  textareaRef,
  words,
  chars,
  onTextareaSelect,
  onContextMenu,
  applyToolbar,
}: Props) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-slate-200/60 overflow-hidden">
      {/* Header + Toolbar */}
      <div className="flex flex-col shrink-0 border-b border-slate-100">
        <div className="flex items-center gap-2 px-4 py-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">원본 문서</span>
          <div className="flex-1" />
          <span className="text-xs text-slate-300">
            {words.toLocaleString()}단어 · {chars.toLocaleString()}자
          </span>
        </div>
        {mode === "edit" && (
          <div className="flex items-center gap-0.5 px-3 pb-2 overflow-x-auto">
            {TOOLBAR.map((action, i) =>
              action.title === "sep" ? (
                <div key={i} className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
              ) : (
                <button
                  key={i}
                  onClick={() => applyToolbar(action)}
                  title={action.title}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
                >
                  {action.icon}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          {mode === "edit" ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.metaKey && e.key === "b") { e.preventDefault(); applyToolbar(TOOLBAR[0]); }
                if (e.metaKey && e.key === "i") { e.preventDefault(); applyToolbar(TOOLBAR[1]); }
              }}
              onSelect={onTextareaSelect}
              onMouseUp={onTextareaSelect}
              onKeyUp={onTextareaSelect}
              onContextMenu={onContextMenu}
              placeholder="내용을 작성하세요..."
              className="w-full min-h-[70vh] text-base text-slate-700 leading-relaxed bg-transparent border-0 focus:outline-none resize-none placeholder-slate-300"
            />
          ) : (
            <div className={PROSE_CLASS}>
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="text-slate-300 italic">내용이 없습니다</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
