"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ExperienceSearchResult } from "@/lib/api/experiences";
import { MODELS, PROSE_CLASS } from "../_constants";
import type { AssistAction, ChatMessage } from "../_types";
import {
  IconAppend, IconContinue, IconCopy, IconEvaluate,
  IconImprove, IconInsert, IconSection, IconSummarize,
} from "./icons";

// ─── Quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS: AssistAction[] = [
  {
    key: "continue",
    label: "계속 작성",
    icon: <IconContinue />,
    instruction: (c) =>
      `아래 문서의 내용을 자연스럽게 이어서 작성해주세요. 문서의 흐름과 스타일을 유지하면서 다음 내용을 작성하세요:\n\n${c}`,
  },
  {
    key: "section",
    label: "섹션 추가",
    icon: <IconSection />,
    instruction: (c) =>
      `아래 문서에 추가할 새로운 섹션을 제안하고 작성해주세요. 문서의 맥락에 맞는 주제를 선택하세요:\n\n${c}`,
  },
  {
    key: "improve",
    label: "내용 개선",
    icon: <IconImprove />,
    instruction: (c) =>
      `아래 문서의 문장을 더 명확하고 전문적으로 개선해주세요. 내용은 유지하되 표현을 다듬어주세요:\n\n${c}`,
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

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  messages: ChatMessage[];
  streamingContent: string;
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
  onClearMessages: () => void;
  onRunAssist: (instruction: string, userLabel?: string) => void;
  onApplyResult: (result: string, mode: "append" | "replace") => void;
  onCopyText: (text: string, id: string) => void;
}

export function AiPanel({
  messages,
  streamingContent,
  aiLoading,
  aiError,
  customPrompt,
  setCustomPrompt,
  model,
  setModel,
  copiedId,
  messagesEndRef,
  selectedText,
  onClearMessages,
  onRunAssist,
  onApplyResult,
  onCopyText,
}: Props) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#FAFBFC] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200/60">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
          <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI 어시스턴트</span>
        <div className="flex-1" />
        {messages.length > 0 && (
          <button
            onClick={onClearMessages}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            대화 초기화
          </button>
        )}
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

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4">
        {messages.length === 0 && !streamingContent && !aiError && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300 pb-16">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <path d="M18 3L21.5 13.5L32 18L21.5 22.5L18 33L14.5 22.5L4 18L14.5 13.5L18 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <p className="text-xs text-center text-slate-400 leading-relaxed">
              아래 버튼이나 직접 입력으로<br />AI에게 요청해보세요
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] px-3 py-2 bg-indigo-600 text-white text-xs rounded-2xl rounded-tr-sm leading-relaxed">
                {msg.content}
              </div>
            ) : (
              <div className="w-full">
                <div className={`${PROSE_CLASS} bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm px-4 py-3 text-xs shadow-sm`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 px-1">
                  <button
                    onClick={() => onApplyResult(msg.content, "append")}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                  >
                    <IconAppend /> 추가
                  </button>
                  <button
                    onClick={() => onApplyResult(msg.content, "replace")}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    <IconInsert /> 교체
                  </button>
                  <button
                    onClick={() => onCopyText(msg.content, msg.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    <IconCopy /> {copiedId === msg.id ? "복사됨" : "복사"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {streamingContent && (
          <div className="flex flex-col items-start gap-1">
            <div className={`${PROSE_CLASS} w-full bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm px-4 py-3 text-xs shadow-sm opacity-80`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
            </div>
          </div>
        )}

        {aiLoading && !streamingContent && (
          <div className="flex items-start">
            <div className="flex gap-1.5 px-4 py-3 bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm shadow-sm">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {aiError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs text-red-600">{aiError}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom input area */}
      <div className="shrink-0 border-t border-slate-200/60 bg-white px-4 pt-3 pb-4 space-y-2.5">
        {/* Quick actions */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_ACTIONS.filter((a) => a.key !== "evaluate").map((action) => (
              <button
                key={action.key}
                onClick={() => onRunAssist(action.instruction(selectedText || ""), action.label)}
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
              onClick={() => onRunAssist(action.instruction(selectedText || ""), action.label)}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {action.icon}
              <span>{action.label} — AI 컨설팅</span>
            </button>
          ))}
        </div>

        {/* Custom prompt */}
        <div className="flex gap-2">
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && customPrompt.trim()) {
                e.preventDefault();
                onRunAssist(customPrompt);
              }
            }}
            placeholder="직접 요청 입력... (⌘↵ 실행)"
            rows={2}
            className="flex-1 text-xs text-slate-700 placeholder-slate-300 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-200 resize-none transition-all"
          />
          <button
            onClick={() => { if (customPrompt.trim()) onRunAssist(customPrompt); }}
            disabled={!customPrompt.trim() || aiLoading}
            className="shrink-0 px-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
      </div>
    </div>
  );
}
