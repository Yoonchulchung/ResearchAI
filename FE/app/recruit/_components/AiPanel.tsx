"use client";

import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MODELS, PROSE_CLASS } from "../_constants";
import type { ChatMessage } from "../_types";
import type { ExperienceSearchResult } from "@/lib/api/experiences";
import {
  IconAppend, IconContinue, IconCopy, IconEvaluate, IconExample,
  IconImprove, IconInsert, IconPlagiarism, IconSection, IconSpellcheck, IconSummarize,
} from "./icons";
import { useTheme } from "@/contexts/ThemeContext";
import { isNearScrollBottom } from "@/lib/scroll-guards";

// ─── Icon mapping ─────────────────────────────────────────────────────────────

const FALLBACK_ACTIONS: { key: string; label: string; skipCompanyCtx?: boolean }[] = [
  { key: "improve", label: "내용 개선" },
  { key: "spellcheck", label: "맞춤법 교정", skipCompanyCtx: true },
  { key: "example", label: "예시 생성" },
  { key: "plagiarism", label: "AI 표절률 검사", skipCompanyCtx: true },
  { key: "evaluate", label: "글 평가", skipCompanyCtx: true },
];

const KEY_TO_ICON: Record<string, React.ReactNode> = {
  continue: <IconContinue />,
  section: <IconSection />,
  improve: <IconImprove />,
  spellcheck: <IconSpellcheck />,
  summarize: <IconSummarize />,
  example: <IconExample />,
  plagiarism: <IconPlagiarism />,
  evaluate: <IconEvaluate />,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  messages: ChatMessage[];
  aiLoading: boolean;
  aiError: string | null;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  copiedId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  selectedText: string;
  content: string;
  selectedExperiences: ExperienceSearchResult[];
  ragQuery: string;
  setRagQuery: (q: string) => void;
  ragResults: ExperienceSearchResult[];
  ragLoading: boolean;
  handleRagSearch: () => void;
  toggleExperience: (exp: ExperienceSearchResult) => void;
  onClearMessages: () => void;
  onRunAssist: (instruction: string, userLabel?: string, skipCompanyCtx?: boolean, actionKey?: string) => void;
  onApplyResult: (result: string, mode: "append" | "replace") => void;
  onCopyText: (text: string, id: string) => void;
  companyName: string;
  onClose?: () => void;
}

export function AiPanel({
  messages,
  aiLoading,
  aiError,
  customPrompt,
  setCustomPrompt,
  model,
  setModel,
  copiedId,
  messagesEndRef,
  selectedExperiences,
  ragQuery,
  setRagQuery,
  ragResults,
  ragLoading,
  handleRagSearch,
  toggleExperience,
  onClearMessages,
  onRunAssist,
  onApplyResult,
  onCopyText,
  onClose,
}: Props) {
  const { theme, uiStyle } = useTheme();
  const isGlass = uiStyle === "glass";
  const isDark = theme === "dark";
  const actions = FALLBACK_ACTIONS;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "library">("chat");
  const lastMsgScrollTopRef = useRef(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 72)}px`;
      textareaRef.current.style.overflowY = scrollHeight > 72 ? "auto" : "hidden";
    }
  }, [customPrompt]);

  const handleMsgScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    if (isNearScrollBottom(el)) {
      lastMsgScrollTopRef.current = scrollTop;
      return;
    }
    const delta = scrollTop - lastMsgScrollTopRef.current;
    lastMsgScrollTopRef.current = scrollTop;
    if (Math.abs(delta) < 4) return;
    if (delta > 0 && scrollTop > 20) setIsHeaderHidden(true);
    else if (delta < 0) setIsHeaderHidden(false);
  };

  return (
    <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-colors ${isGlass ? "bg-transparent" : "bg-slate-50"} ${isExpanded ? "max-lg:fixed max-lg:inset-0 max-lg:z-50" : ""}`}>
      {/* Header — 채팅 스크롤 시 숨김 */}
      <div className={`shrink-0 overflow-hidden transition-all duration-200 ease-out ${isHeaderHidden ? "max-h-0 opacity-0 pointer-events-none" : "max-h-28 opacity-100"}`}>
      <div className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 border-b transition-colors ${isGlass ? (isDark ? "bg-transparent border-white/10" : "bg-white/60 border-black/10") : "bg-white border-slate-200/60"}`}>
        <span className={`text-sm font-semibold uppercase tracking-wider shrink-0 ${isDark ? "text-white/60" : "text-slate-500"}`}>AI 어시스턴트</span>
        {/* Tab toggle */}
        <div className={`flex rounded-md overflow-hidden border text-xs font-medium shrink-0 ${isDark ? "border-white/20" : "border-slate-200"}`}>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-2 py-1 transition-colors ${activeTab === "chat" ? (isDark ? "bg-white/20 text-white" : "bg-indigo-600 text-white") : (isDark ? "text-white/50 hover:text-white/80 hover:bg-white/10" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50")}`}
          >채팅</button>
          <button
            onClick={() => setActiveTab("library")}
            className={`px-2 py-1 transition-colors ${activeTab === "library" ? (isDark ? "bg-white/20 text-white" : "bg-indigo-600 text-white") : (isDark ? "text-white/50 hover:text-white/80 hover:bg-white/10" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50")}`}
          >경험 라이브러리{selectedExperiences.length > 0 && ` (${selectedExperiences.length})`}</button>
        </div>
        {/* Mobile: spellcheck + evaluate */}
        <button
          onClick={() => onRunAssist("", "맞춤법 교정", true, "spellcheck")}
          disabled={aiLoading}
          title="맞춤법 교정"
          className={`lg:hidden flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
            isGlass && isDark
              ? "text-white/80 bg-white/5 hover:bg-white/10 border-white/10"
              : "text-slate-600 bg-white hover:bg-indigo-50 hover:text-indigo-700 border-slate-200 hover:border-indigo-200"
          }`}
        >
          {KEY_TO_ICON["spellcheck"]}
          <span>맞춤법</span>
        </button>
        <button
          onClick={() => onRunAssist("", "글 평가", true, "evaluate")}
          disabled={aiLoading}
          title="글 평가"
          className={`lg:hidden flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
            isGlass && isDark
              ? "text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30"
              : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
          }`}
        >
          {KEY_TO_ICON["evaluate"]}
          <span>글 평가</span>
        </button>
        {/* PC: all quick action buttons inline */}
        <div className="hidden lg:flex items-center gap-1 flex-wrap">
          {actions.filter((a) => a.key !== "evaluate" && a.key !== "plagiarism").map((action) => (
            <button
              key={action.key}
              onClick={() => onRunAssist("", action.label, action.skipCompanyCtx, action.key)}
              disabled={aiLoading}
              title={action.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                isGlass && isDark
                  ? "text-white/80 bg-white/5 border-white/10 hover:bg-white/10 hover:text-white"
                  : "text-slate-600 bg-white hover:bg-indigo-50 hover:text-indigo-700 border-slate-200 hover:border-indigo-200"
              }`}
            >
              {KEY_TO_ICON[action.key]}
              <span>{action.label}</span>
            </button>
          ))}
          {actions.filter((a) => a.key === "evaluate" || a.key === "plagiarism").map((action) => (
            <button
              key={action.key}
              onClick={() => onRunAssist("", action.label, action.skipCompanyCtx, action.key)}
              disabled={aiLoading}
              title={action.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                isGlass && isDark
                  ? "text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30"
                  : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
              }`}
            >
              {KEY_TO_ICON[action.key]}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {onClose && (
          <button
            onClick={onClose}
            title="AI 어시스턴트 닫기"
            className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-md border transition-all ${
              isDark ? "text-white/50 border-white/20 hover:bg-white/10 hover:text-white" : "text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3 3L10 10M10 3L3 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {messages.length > 0 && (
          <>
            {/* 초기화 아이콘 */}
            <button
              onClick={onClearMessages}
              title="대화 초기화"
              className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors ${isDark ? "text-white/30 hover:text-white/70" : "text-slate-300 hover:text-slate-600"}`}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 3h9M5 3V2h3v1M4 3l.5 7h4L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* 모바일 전용 확장 버튼 */}
            <button
              onClick={() => setIsExpanded((v) => !v)}
              title={isExpanded ? "축소" : "확장"}
              className={`lg:hidden shrink-0 flex items-center justify-center w-6 h-6 rounded-md border transition-all ${
                isDark ? "text-white/50 border-white/20 hover:bg-white/10" : "text-slate-400 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {isExpanded ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L4.5 4.5M10 2L7.5 4.5M2 10L4.5 7.5M10 10L7.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L3.5 3.5M11 1L8.5 3.5M1 11L3.5 8.5M11 11L8.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </>
        )}
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={`min-w-0 max-w-[6rem] sm:max-w-none text-xs sm:text-sm border rounded-md px-2 py-1 focus:outline-none cursor-pointer disabled:opacity-50 ${isGlass && isDark
              ? "!bg-white/10 !text-white !border-white/20 focus:ring-1 focus:ring-white/40"
              : "text-slate-600 bg-slate-50 border-slate-200 focus:ring-1 focus:ring-indigo-200"
            }`}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      </div>{/* /header animation wrapper */}

      {/* Experience Library tab content */}
      {activeTab === "library" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Search bar */}
          <div className={`shrink-0 flex gap-2 px-3 py-2.5 border-b ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-200/60 bg-white"}`}>
            <input
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRagSearch(); }}
              placeholder="경험 검색..."
              className={`flex-1 text-xs border rounded-md px-3 py-1.5 focus:outline-none transition-colors ${
                isGlass && isDark
                  ? "!bg-black/20 !text-white !border-white/20 placeholder-white/40 focus:border-white/50"
                  : "bg-white text-slate-700 border-slate-200 placeholder-slate-400 focus:border-indigo-300"
              }`}
            />
            <button
              onClick={handleRagSearch}
              disabled={ragLoading}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 transition-all ${isGlass && isDark ? "bg-white/10 border border-white/20 text-white hover:bg-white/20" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
            >
              {ragLoading ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin block" /> : "검색"}
            </button>
          </div>
          {/* Results */}
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
            {ragResults.length === 0 && !ragLoading && (
              <p className={`text-xs text-center py-8 ${isDark ? "text-white/40" : "text-slate-400"}`}>
                경험을 검색하면 여기에 결과가 나타납니다
              </p>
            )}
            {ragResults.map((exp) => {
              const selected = selectedExperiences.some((s) => s.id === exp.id);
              return (
                <button
                  key={exp.id}
                  onClick={() => toggleExperience(exp)}
                  className={`text-left rounded-md border px-3 py-2.5 transition-all ${
                    selected
                      ? isGlass && isDark
                        ? "bg-indigo-500/20 border-indigo-400/40 text-white"
                        : "bg-indigo-50 border-indigo-300 text-indigo-900"
                      : isGlass && isDark
                        ? "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${selected ? "bg-indigo-600 border-indigo-600" : isDark ? "border-white/30" : "border-slate-300"}`}>
                      {selected && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{exp.title}</p>
                      {exp.category && <p className={`text-xs mt-0.5 ${isDark ? "text-white/40" : "text-slate-400"}`}>{exp.category}</p>}
                      <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${isDark ? "text-white/60" : "text-slate-500"}`}>{exp.content}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {/* Selected summary */}
          {selectedExperiences.length > 0 && (
            <div className={`shrink-0 border-t px-3 py-2 text-xs ${isGlass ? (isDark ? "border-white/10 text-white/60" : "border-black/10 text-slate-500") : "border-slate-200/60 text-slate-500 bg-white"}`}>
              {selectedExperiences.length}개 경험 선택됨 — AI 채팅 시 자동으로 포함됩니다
            </div>
          )}
        </div>
      )}

      {/* Messages area — chat tab only */}
      {activeTab === "chat" && <div onScroll={handleMsgScroll} className="flex-1 overflow-y-auto min-h-0 flex flex-col px-3 sm:px-4 py-2 sm:py-4 gap-3 sm:gap-4">
        {messages.length === 0 && !aiError && (
          <div className={`flex-1 flex flex-col items-center justify-center gap-2 sm:gap-3 ${isDark ? "text-white/30" : "text-slate-300"}`}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <path d="M18 3L21.5 13.5L32 18L21.5 22.5L18 33L14.5 22.5L4 18L14.5 13.5L18 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <p className={`text-sm text-center leading-relaxed ${isDark ? "text-white/50" : "text-slate-400"}`}>
              아래 버튼이나 직접 입력으로<br />AI에게 요청해보세요
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {msg.role === "user" ? (
              <div className={`max-w-[85%] px-4 py-2.5 text-sm rounded-md rounded-tr-sm leading-relaxed ${isGlass ? "bg-indigo-500/80 text-white border border-indigo-400/30 backdrop-blur-sm" : "bg-indigo-600 text-white"}`}>
                {msg.content}
              </div>
            ) : (
              <div className="w-full">
                <div className={`${PROSE_CLASS} border rounded-md rounded-tl-sm px-4 py-3 text-sm ${isGlass
                  ? (isDark ? "bg-white/10 border-white/20 text-white/95 prose-invert backdrop-blur-md" : "bg-white/60 border-black/10 text-slate-800 backdrop-blur-md")
                  : "bg-white border-slate-200/80"} ${msg.streaming ? "opacity-80" : ""}`}>
                  {msg.streaming && !msg.content ? (
                    <div className="flex gap-1.5 py-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-sm bg-indigo-300 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  ) : (
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      {msg.streaming && (
                        <span className="inline-block w-1 h-3.5 bg-indigo-400 animate-pulse ml-0.5 align-text-bottom" />
                      )}
                    </>
                  )}
                </div>
                {!msg.streaming && (
                  <div className="flex items-center gap-1.5 mt-1.5 px-1">
                    <button
                      onClick={() => onApplyResult(msg.content, "append")}
                      className={`flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-md border transition-colors ${
                        isGlass && isDark ? "text-indigo-200 bg-white/10 border-white/20 hover:bg-white/20" : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
                      }`}
                    >
                      <IconAppend /> 추가
                    </button>
                    <button
                      onClick={() => onApplyResult(msg.content, "replace")}
                      className={`flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-md border transition-colors ${
                        isGlass && isDark ? "text-white/80 bg-white/5 border-white/10 hover:bg-white/10" : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200/60"
                      }`}
                    >
                      <IconInsert /> 교체
                    </button>
                    <button
                      onClick={() => onCopyText(msg.content, msg.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-md border transition-colors ${
                        isGlass && isDark ? "text-white/80 bg-white/5 border-white/10 hover:bg-white/10" : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200/60"
                      }`}
                    >
                      <IconCopy /> {copiedId === msg.id ? "복사됨" : "복사"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {aiError && (
          <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3">
            <p className="text-sm text-red-600">{aiError}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>}

      {/* Bottom input area — chat tab only */}
      {activeTab === "chat" && <div className={`shrink-0 border-t px-2.5 sm:px-4 pt-1.5 sm:pt-3 pb-2 sm:pb-4 transition-colors ${isGlass ? (isDark ? "bg-transparent border-white/10" : "bg-transparent border-black/10") : "bg-white border-slate-200/60"}`}>
        {/* Custom prompt */}
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (customPrompt.trim()) onRunAssist(customPrompt);
              }
            }}
            placeholder="직접 요청 입력..."
            rows={1}
            style={{ maxHeight: "72px" }}
            className={`flex-1 text-xs sm:text-sm border rounded-md px-3 py-1 sm:py-2 focus:outline-none resize-none overflow-hidden transition-colors ${
                isGlass && isDark
                ? "bg-black/20! text-white! border-white/20! placeholder-white/40 focus:border-white/50"
                : "bg-white text-slate-700 border-slate-200 placeholder-slate-400 focus:bg-white focus:border-indigo-300"
              }`}
          />
          <button
            onClick={() => { if (customPrompt.trim()) onRunAssist(customPrompt); }}
            disabled={!customPrompt.trim() || aiLoading}
            className={`shrink-0 px-2.5 sm:px-3 rounded-md min-h-8 sm:min-h-10 disabled:opacity-40 disabled:cursor-not-allowed transition-all ${isGlass && isDark ? "bg-white/10 border border-white/20 text-white hover:bg-white/20" : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
          >
            {aiLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin block" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1L10 5.5M10 5.5L5.5 10M10 5.5H1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>}
    </div>
  );
}
