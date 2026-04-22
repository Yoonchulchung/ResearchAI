"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ConversationMessage } from "../hooks/useNewSession";

interface Props {
  messages: ConversationMessage[];
  classifying: boolean;
  onReset: () => void;
  onForceResearch: () => void;
  researchRunning: boolean;
}

const INTENT_META: Record<
  NonNullable<ConversationMessage["intent"]>,
  { label: string; badgeClass: string; bubbleClass: string }
> = {
  chat: {
    label: "💬 대화",
    badgeClass: "bg-slate-200 text-slate-700",
    bubbleClass: "bg-slate-50 border-slate-200",
  },
  clarify: {
    label: "❓ 추가 질문 필요",
    badgeClass: "bg-amber-200 text-amber-800",
    bubbleClass: "bg-amber-50 border-amber-200",
  },
  research: {
    label: "🔍 리서치 진행",
    badgeClass: "bg-indigo-200 text-indigo-800",
    bubbleClass: "bg-indigo-50 border-indigo-200",
  },
};

export function IntentConversation({ messages, classifying, onReset, onForceResearch, researchRunning }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, classifying]);

  if (messages.length === 0 && !classifying) return null;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const canForceResearch =
    lastAssistant?.intent === "clarify" || lastAssistant?.intent === "chat";

  return (
    <div className="bg-white border-2 border-indigo-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-indigo-50 bg-linear-to-r from-indigo-50 to-white">
        <span className="text-base">✦</span>
        <span className="text-sm font-semibold text-slate-800">AI 리서치 도우미</span>
        <span className="text-xs text-slate-400 hidden sm:inline">
          · 질문을 분석해 대화/리서치/추가 질문을 판단합니다
        </span>
        <button
          onClick={onReset}
          className="ml-auto text-xs px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          대화 초기화
        </button>
      </div>

      <div className="max-h-125 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-indigo-600 text-white">
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              </div>
            );
          }
          const meta = m.intent ? INTENT_META[m.intent] : null;
          return (
            <div key={i} className="flex justify-start">
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 border ${
                  meta?.bubbleClass ?? "bg-slate-50 border-slate-200"
                }`}
              >
                {meta && (
                  <span
                    className={`inline-block text-xs font-bold px-2 py-0.5 rounded-md mb-2 ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>
                )}
                <div className="text-sm text-slate-800 prose prose-sm prose-slate max-w-none
                  [&_p]:my-1 [&_p]:leading-relaxed [&_p]:text-slate-800
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
                  [&_li]:my-0.5 [&_li]:text-slate-800
                  [&_strong]:font-semibold [&_strong]:text-slate-900
                  [&_code]:bg-white [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "(빈 응답)"}</ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}

        {classifying && (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
              <span className="text-xs text-slate-500 ml-2">AI가 의도를 분석 중...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {canForceResearch && !researchRunning && (
        <div className="px-5 py-3 border-t border-indigo-100 bg-indigo-50/30 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            답변으로 충분하지 않다면 그대로 리서치를 진행할 수 있습니다
          </p>
          <button
            onClick={onForceResearch}
            className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shrink-0 shadow-sm"
          >
            그대로 리서치 시작 →
          </button>
        </div>
      )}
    </div>
  );
}
