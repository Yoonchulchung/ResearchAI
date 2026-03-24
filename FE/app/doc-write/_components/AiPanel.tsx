"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ExperienceSearchResult } from "@/lib/api/experiences";
import { MODELS, PROSE_CLASS } from "../_constants";
import type { AssistAction, ChatMessage } from "../_types";
import {
  IconAppend, IconContinue, IconCopy, IconEvaluate,
  IconImprove, IconInsert, IconPlagiarism, IconSection, IconSummarize,
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
    key: "plagiarism",
    label: "AI 표절률 검사",
    skipCompanyCtx: true,
    icon: <IconPlagiarism />,
    instruction: (c) => `당신은 AI 생성 텍스트 감지 전문가입니다. 아래 문서를 분석하여 AI 표절 가능성을 평가해주세요.

## 분석 항목
1. **AI 생성 가능성** — 문장 패턴, 반복적 구조, 지나치게 완성된 문체 등 AI 특징 여부 (0~100%)
2. **표현 다양성** — 어휘·문장 구조의 다양성 및 자연스러운 개인 특색 유무
3. **의심 구간** — AI가 작성했을 가능성이 높은 문장이나 단락을 인용하여 지적
4. **독창성 점수** — 글 전체의 독창성 수준 (10점 만점)
5. **개선 권고** — 더 인간적이고 개성 있는 글로 개선하기 위한 구체적 제안

각 항목에 근거와 함께 답하고, 마지막에 종합 판정(인간 작성 / 일부 AI 보조 / AI 주도)을 내려주세요.

---
## 검사 대상 문서

${c}`,
  },
  {
    key: "evaluate",
    label: "글 평가",
    skipCompanyCtx: true,
    icon: <IconEvaluate />,
    instruction: (c) => `당신은 전문 글쓰기 컨설턴트입니다. 아래 문서를 다음 항목에 따라 컨설팅 보고서 형식으로 평가해주세요.

## 평가 항목
1. **반복 단어 사용** — 같은 단어·표현이 과도하게 반복되는 구간을 찾아 원문을 인용하고 대안 표현을 제안해주세요
2. **진부한 표현** — "최선을 다하다", "열정을 가지고" 등 식상하거나 의미가 희석된 표현을 원문 인용과 함께 지적해주세요
3. **애매한 표현** — 독자가 오해하거나 의미가 불분명한 문장을 원문 인용과 함께 구체적인 수정 방향을 제안해주세요
4. **지나치게 긴 문장** — 한 문장에 내용이 과도하게 압축되어 가독성을 해치는 구간을 원문 인용 후 분리 방법을 제안해주세요
5. **논리적인 흐름** — 문단 간 연결이 자연스러운지, 주장과 근거가 논리적으로 이어지는지, 비약이나 모순이 없는지 평가해주세요
6. **질문에 적절한 내용** — 글의 주제·질문 의도에 맞는 내용을 담고 있는지, 핵심에서 벗어난 불필요한 내용이 있는지 평가해주세요
7. **종합 개선 제안** — 위 분석을 바탕으로 우선순위가 높은 개선 방향 3가지를 제안해주세요

각 항목에서 실제 원문을 인용(> 인용 형식)하여 근거를 명확히 하고, 마지막에 전체 완성도 점수(10점 만점)와 한 줄 종합 의견을 작성해주세요.

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
  onRunAssist: (instruction: string, userLabel?: string, skipCompanyCtx?: boolean) => void;
  onApplyResult: (result: string, mode: "append" | "replace") => void;
  onCopyText: (text: string, id: string) => void;
  companyName: string;
  companyProfile: string;
  profileLoading: boolean;
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
  companyName,
  companyProfile,
  profileLoading,
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

      {/* Company profile panel */}
      {(companyProfile || profileLoading) && (
        <div className="shrink-0 border-b border-indigo-100 bg-indigo-50/60 px-4 py-3 max-h-52 overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-2">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-indigo-500 shrink-0">
              <path d="M5.5 1L6.7 4.2L10 5L6.7 5.8L5.5 9L4.3 5.8L1 5L4.3 4.2L5.5 1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
            <span className="text-xs font-semibold text-indigo-600">{companyName} 인재상</span>
            {profileLoading && (
              <span className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin ml-1" />
            )}
          </div>
          {companyProfile && (
            <div className={`${PROSE_CLASS} text-xs`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{companyProfile}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

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
            {QUICK_ACTIONS.filter((a) => a.key !== "evaluate" && a.key !== "plagiarism").map((action) => (
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
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_ACTIONS.filter((a) => a.key === "evaluate" || a.key === "plagiarism").map((action) => (
              <button
                key={action.key}
                onClick={() => onRunAssist(action.instruction(selectedText || ""), action.label, action.skipCompanyCtx)}
                disabled={aiLoading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
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
