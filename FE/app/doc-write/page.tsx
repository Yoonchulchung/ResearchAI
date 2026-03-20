"use client";

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enqueueWriteAssist, streamWriteAssist } from "@/lib/api/ai";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssistAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  instruction: (content: string) => string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "claude-haiku-4-5", name: "Claude Haiku" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "gpt-4o", name: "GPT-4o" },
];

const QUICK_ACTIONS: AssistAction[] = [
  {
    key: "continue",
    label: "계속 작성",
    icon: <IconContinue />,
    instruction: (c) => `아래 문서의 내용을 자연스럽게 이어서 작성해주세요. 문서의 흐름과 스타일을 유지하면서 다음 내용을 작성하세요:\n\n${c}`,
  },
  {
    key: "section",
    label: "섹션 추가",
    icon: <IconSection />,
    instruction: (c) => `아래 문서에 추가할 새로운 섹션을 제안하고 작성해주세요. 문서의 맥락에 맞는 주제를 선택하세요:\n\n${c}`,
  },
  {
    key: "improve",
    label: "내용 개선",
    icon: <IconImprove />,
    instruction: (c) => `아래 문서의 문장을 더 명확하고 전문적으로 개선해주세요. 내용은 유지하되 표현을 다듬어주세요:\n\n${c}`,
  },
  {
    key: "summarize",
    label: "요약",
    icon: <IconSummarize />,
    instruction: (c) => `아래 문서의 핵심 내용을 간결하게 요약해주세요:\n\n${c}`,
  },
  {
    key: "evaluate",
    label: "글 평가",
    icon: <IconEvaluate />,
    instruction: (c) => `당신은 전문 글쓰기 컨설턴트입니다. 아래 문서를 다음 항목에 따라 컨설팅 보고서 형식으로 평가해주세요.

## 평가 항목
1. **전체 완성도** — 글의 목적이 명확하고 내용이 충실한가
2. **구조와 흐름** — 논리적 전개와 단락 구성이 자연스러운가
3. **문장력** — 문장의 명확성, 간결성, 표현의 적절성
4. **독자 친화성** — 대상 독자에게 이해하기 쉽게 쓰였는가
5. **개선 제안** — 구체적이고 실행 가능한 개선 방향 3가지 이상

각 항목별로 점수(10점 만점)와 간단한 코멘트를 포함하고, 마지막에 종합 의견을 작성해주세요.

---
## 평가 대상 문서

${c}`,
  },
];

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconContinue() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7H12M8 3L12 7L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconSection() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 4H12M2 7H8M2 10H10M12 9V13M10 11H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function IconImprove() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}
function IconSummarize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3H12M2 6H9M2 9H11M2 12H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function IconEvaluate() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4.5 7L6.5 9L9.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconBold() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2H7C8.1 2 9 2.9 9 4C9 5.1 8.1 6 7 6H3V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M3 6H7.5C8.88 6 10 7.12 10 8.5C10 9.88 8.88 11 7.5 11H3V6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>; }
function IconItalic() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 2H9M3 10H7M7 2L5 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function IconH1() { return <span className="text-[10px] font-bold leading-none">H1</span>; }
function IconH2() { return <span className="text-[10px] font-bold leading-none">H2</span>; }
function IconH3() { return <span className="text-[10px] font-bold leading-none">H3</span>; }
function IconList() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="2" cy="3.5" r="1" fill="currentColor"/><circle cx="2" cy="6.5" r="1" fill="currentColor"/><circle cx="2" cy="9.5" r="1" fill="currentColor"/><path d="M5 3.5H10M5 6.5H10M5 9.5H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function IconCode() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 3L1 6L4 9M8 3L11 6L8 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconQuote() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 5C2 3.34 3.34 2 5 2V2C5 2 4 3.5 4 5V7H2V5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/><path d="M7 5C7 3.34 8.34 2 10 2V2C10 2 9 3.5 9 5V7H7V5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>; }
function IconLink() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 7C5.55 7.55 6.45 7.55 7 7L9.5 4.5C10.05 3.95 10.05 3.05 9.5 2.5C8.95 1.95 8.05 1.95 7.5 2.5L6.75 3.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M7 5C6.45 4.45 5.55 4.45 5 5L2.5 7.5C1.95 8.05 1.95 8.95 2.5 9.5C3.05 10.05 3.95 10.05 4.5 9.5L5.25 8.75" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>; }
function IconHr() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IconDownload() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V9M4 6L7 9L10 6M2 12H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconEye() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7C1 7 3 3 7 3C11 3 13 7 13 7C13 7 11 11 7 11C3 11 1 7 1 7Z" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/></svg>; }
function IconEdit() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>; }
function IconCopy() { return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 9V2C1 1.45 1.45 1 2 1H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function IconInsert() { return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 2V11M2 6.5H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IconAppend() { return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3H11M2 6H8M2 9H6M9 10V13M7.5 11.5H10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }

// ─── Toolbar ──────────────────────────────────────────────────────────────────

type ToolbarAction = {
  icon: React.ReactNode;
  title: string;
  fn: (text: string, sel: { start: number; end: number }) => { value: string; cursor: number };
};

const TOOLBAR: ToolbarAction[] = [
  {
    icon: <IconBold />, title: "굵게 (⌘B)",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end) || "텍스트";
      const before = text.slice(0, start), after = text.slice(end);
      return { value: `${before}**${sel}**${after}`, cursor: start + sel.length + 4 };
    },
  },
  {
    icon: <IconItalic />, title: "기울임 (⌘I)",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end) || "텍스트";
      const before = text.slice(0, start), after = text.slice(end);
      return { value: `${before}_${sel}_${after}`, cursor: start + sel.length + 2 };
    },
  },
  { icon: null, title: "sep" as const, fn: (t, s) => ({ value: t, cursor: s.start }) },
  {
    icon: <IconH1 />, title: "제목 1",
    fn: (text, { start }) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, lineStart)}# ${text.slice(lineStart)}`, cursor: lineStart + 2 };
    },
  },
  {
    icon: <IconH2 />, title: "제목 2",
    fn: (text, { start }) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, lineStart)}## ${text.slice(lineStart)}`, cursor: lineStart + 3 };
    },
  },
  {
    icon: <IconH3 />, title: "제목 3",
    fn: (text, { start }) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, lineStart)}### ${text.slice(lineStart)}`, cursor: lineStart + 4 };
    },
  },
  { icon: null, title: "sep" as const, fn: (t, s) => ({ value: t, cursor: s.start }) },
  {
    icon: <IconList />, title: "목록",
    fn: (text, { start }) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, lineStart)}- ${text.slice(lineStart)}`, cursor: lineStart + 2 };
    },
  },
  {
    icon: <IconCode />, title: "코드",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end);
      const before = text.slice(0, start), after = text.slice(end);
      if (sel.includes("\n")) {
        return { value: `${before}\n\`\`\`\n${sel || "코드"}\n\`\`\`\n${after}`, cursor: start + 5 };
      }
      return { value: `${before}\`${sel || "코드"}\`${after}`, cursor: start + (sel.length || 2) + 2 };
    },
  },
  {
    icon: <IconQuote />, title: "인용",
    fn: (text, { start }) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      return { value: `${text.slice(0, lineStart)}> ${text.slice(lineStart)}`, cursor: lineStart + 2 };
    },
  },
  {
    icon: <IconLink />, title: "링크",
    fn: (text, { start, end }) => {
      const sel = text.slice(start, end) || "링크 텍스트";
      const before = text.slice(0, start), after = text.slice(end);
      return { value: `${before}[${sel}](url)${after}`, cursor: start + sel.length + 3 };
    },
  },
  { icon: null, title: "sep" as const, fn: (t, s) => ({ value: t, cursor: s.start }) },
  {
    icon: <IconHr />, title: "구분선",
    fn: (text, { start }) => {
      const before = text.slice(0, start);
      const after = text.slice(start);
      return { value: `${before}\n---\n${after}`, cursor: start + 6 };
    },
  },
];

// ─── Word Count ───────────────────────────────────────────────────────────────

function wordCount(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  return { words, chars };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocWritePage() {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [model, setModel] = useState(MODELS[0].id);
  const [customPrompt, setCustomPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 툴바 버튼 적용
  const applyToolbar = useCallback((action: ToolbarAction) => {
    if (action.title === "sep") return;
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const { value: newValue, cursor } = action.fn(content, { start, end });
    setContent(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursor, cursor);
    });
  }, [content]);

  // AI 실행 (큐 등록 → SSE 스트리밍)
  const runAssist = async (instruction: string) => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiResult(null);
    setAiError(null);
    let accumulated = "";
    try {
      const { jobId } = await enqueueWriteAssist(content, instruction, model);
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") {
          accumulated += event.text;
          setAiResult(accumulated);
        } else if (event.type === "error") {
          setAiError(event.message);
        }
      });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setAiLoading(false);
    }
  };

  // AI 결과 적용
  const applyResult = (mode: "append" | "replace") => {
    if (!aiResult) return;
    if (mode === "append") {
      setContent((prev) => prev ? `${prev}\n\n${aiResult}` : aiResult);
    } else {
      setContent(aiResult);
    }
    setAiResult(null);
  };

  const copyResult = async () => {
    if (!aiResult) return;
    await navigator.clipboard.writeText(aiResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 마크다운 다운로드
  const handleExport = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "문서.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const { words, chars } = wordCount(content);

  const proseClass = `prose prose-sm prose-slate max-w-none
    [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-slate-900
    [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-slate-800
    [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-slate-700
    [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-slate-700
    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
    [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
    [&_li]:my-0.5 [&_li]:text-slate-700
    [&_strong]:font-semibold [&_strong]:text-slate-900
    [&_em]:italic
    [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700 [&_code]:font-mono
    [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:my-3
    [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-500 [&_blockquote]:italic [&_blockquote]:my-3
    [&_hr]:border-slate-200 [&_hr]:my-6
    [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:my-3
    [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-200
    [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200`;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F4F5F7]">

      {/* ── Global Topbar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-slate-200/60 shrink-0">
        <div className="flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-slate-500">
            <path d="M4 2H12C12.55 2 13 2.45 13 3V13C13 13.55 12.55 14 12 14H4C3.45 14 3 13.55 3 13V3C3 2.45 3.45 2 4 2Z" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M6 5H10M6 8H10M6 11H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className="text-sm font-bold text-slate-800">문서 작성</span>
        </div>

        <div className="flex-1" />

        {/* Edit / Preview toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setMode("edit")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "edit" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <IconEdit /> 편집
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "preview" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <IconEye /> 미리보기
          </button>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <IconDownload /> 내보내기
        </button>
      </div>

      {/* ── Split View ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── Left: 원본 문서 ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-slate-200/60 overflow-hidden">

          {/* Panel label + toolbar */}
          <div className="flex flex-col shrink-0 border-b border-slate-100">
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">원본 문서</span>
              <div className="flex-1" />
              <span className="text-xs text-slate-300">{words.toLocaleString()}단어 · {chars.toLocaleString()}자</span>
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
                  )
                )}
              </div>
            )}
          </div>

          {/* Document content */}
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
                  placeholder="내용을 작성하세요..."
                  className="w-full min-h-[70vh] text-base text-slate-700 leading-relaxed bg-transparent border-0 focus:outline-none resize-none placeholder-slate-300"
                />
              ) : (
                <div className={proseClass}>
                  {content
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    : <p className="text-slate-300 italic">내용이 없습니다</p>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: AI 수정 결과 ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FAFBFC] overflow-hidden">

          {/* AI Controls */}
          <div className="shrink-0 border-b border-slate-200/60 bg-white">
            {/* Label + model */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
                <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI 수정 결과</span>
              <div className="flex-1" />
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-200 cursor-pointer"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Quick actions + custom prompt */}
            <div className="px-4 py-3 space-y-2.5">
              <div className="space-y-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  {QUICK_ACTIONS.filter((a) => a.key !== "evaluate").map((action) => (
                    <button
                      key={action.key}
                      onClick={() => runAssist(action.instruction(content))}
                      disabled={aiLoading}
                      className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-100 hover:border-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
                {QUICK_ACTIONS.filter((a) => a.key === "evaluate").map((action) => (
                  <button
                    key={action.key}
                    onClick={() => runAssist(action.instruction(content))}
                    disabled={aiLoading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {action.icon}
                    <span>{action.label} — AI 컨설팅</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && customPrompt.trim()) {
                      e.preventDefault();
                      runAssist(customPrompt);
                    }
                  }}
                  placeholder="직접 요청 입력... (⌘↵ 실행)"
                  rows={2}
                  className="flex-1 text-xs text-slate-700 placeholder-slate-300 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-200 resize-none transition-all"
                />
                <button
                  onClick={() => { if (customPrompt.trim()) runAssist(customPrompt); }}
                  disabled={!customPrompt.trim() || aiLoading}
                  className="shrink-0 px-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {aiLoading
                    ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin block" />
                    : <svg width="13" height="13" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L10 5.5M10 5.5L5.5 10M10 5.5H1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Result area */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {aiLoading && !aiResult && (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
                <p className="text-xs">AI가 작성 중입니다...</p>
              </div>
            )}

            {aiError && (
              <div className="m-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-xs text-red-600">{aiError}</p>
              </div>
            )}

            {aiResult && (
              <div className="max-w-2xl mx-auto px-8 py-6">
                <div className={`${proseClass} ${aiLoading ? "opacity-70" : ""}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResult}</ReactMarkdown>
                </div>
              </div>
            )}

            {!aiLoading && !aiResult && !aiError && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300 px-8 pb-16">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <path d="M18 3L21.5 13.5L32 18L21.5 22.5L18 33L14.5 22.5L4 18L14.5 13.5L18 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <p className="text-xs text-center text-slate-400 leading-relaxed">
                  위 버튼으로 AI 작업을 요청하면<br/>여기에 수정된 내용이 표시됩니다
                </p>
              </div>
            )}
          </div>

          {/* Apply actions (결과가 있을 때만) */}
          {aiResult && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 bg-white border-t border-slate-200/60">
              <button
                onClick={() => applyResult("append")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <IconAppend /> 원본에 추가
              </button>
              <button
                onClick={() => applyResult("replace")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <IconInsert /> 전체 교체
              </button>
              <button
                onClick={copyResult}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <IconCopy /> {copied ? "복사됨" : "복사"}
              </button>
              <button
                onClick={() => setAiResult(null)}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                지우기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
