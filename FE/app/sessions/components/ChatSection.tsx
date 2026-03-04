"use client";

import { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/types";

interface Props {
  chatMessages: ChatMessage[];
  chatBottomRef: RefObject<HTMLDivElement | null>;
  onClearChat: () => void;
  compactionStatus?: "idle" | "running" | "done";
}

export function ChatSection({ chatMessages, chatBottomRef, onClearChat, compactionStatus }: Props) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs font-semibold text-slate-400">리서치 기반 채팅</span>
        <div className="flex-1 h-px bg-slate-200" />
        {compactionStatus === "running" && (
          <span className="text-xs text-indigo-400 flex items-center gap-1 shrink-0">
            <span className="animate-spin inline-block">◌</span>
            컨텍스트 압축 중
          </span>
        )}
        {compactionStatus === "done" && (
          <span className="text-xs text-emerald-500 shrink-0">✦ 압축됨</span>
        )}
        {chatMessages.length > 0 && (
          <button
            onClick={onClearChat}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors shrink-0"
          >
            대화 초기화
          </button>
        )}
      </div>

      {chatMessages.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          리서치 결과에 대해 질문해보세요
        </div>
      ) : (
        <div className="space-y-3">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[75%] bg-indigo-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[85%] bg-white shadow-sm rounded-2xl rounded-tl-sm px-5 py-4">
                  {msg.content ? (
                    <div className="prose prose-sm prose-slate max-w-none
                      [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                      [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-200
                      [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
                      [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1
                      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1
                      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5
                      [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
                      [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
                      [&_li]:my-0.5 [&_li]:text-slate-700
                      [&_p]:my-1 [&_p]:leading-relaxed [&_p]:text-slate-700
                      [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs
                      [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                      <span className="text-xs">답변 생성 중...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>
      )}
    </div>
  );
}
