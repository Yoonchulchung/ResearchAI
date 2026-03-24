"use client";

import { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdown";
import { ChatMessage } from "@/types";

interface Props {
  chatMessages: ChatMessage[];
  chatBottomRef: RefObject<HTMLDivElement | null>;
  onClearChat: () => void;
  onAbort?: () => void;
  chatLoading?: boolean;
  compactionStatus?: "idle" | "running" | "done";
}

function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-300">
      <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function ChatSection({ chatMessages, chatBottomRef, onClearChat, onAbort, chatLoading, compactionStatus }: Props) {
  return (
    <div className="mt-6 px-6 pb-4">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-slate-100" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wide">리서치 기반 채팅</span>
          {compactionStatus === "running" && (
            <span className="text-xs text-indigo-400 flex items-center gap-1">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-300 border-t-indigo-500 rounded-full" />
              컨텍스트 압축 중
            </span>
          )}
          {compactionStatus === "done" && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              압축됨
            </span>
          )}
          {chatLoading && onAbort && (
            <button
              onClick={onAbort}
              className="text-xs text-red-400 hover:text-red-600 transition-colors flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-red-50"
            >
              <span className="w-2 h-2 bg-red-400 rounded-sm inline-block" />
              중단
            </button>
          )}
          {chatMessages.length > 0 && !chatLoading && (
            <button
              onClick={onClearChat}
              className="text-xs text-slate-300 hover:text-red-400 transition-colors px-1.5"
            >
              초기화
            </button>
          )}
        </div>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Messages */}
      {chatMessages.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <ChatBubbleIcon />
          <p className="text-sm text-slate-400">리서치 결과에 대해 질문해보세요</p>
          <p className="text-xs text-slate-300">아래 입력창에 메시지를 입력하세요</p>
        </div>
      ) : (
        <div className="space-y-4">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[72%] bg-indigo-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-md shadow-sm shadow-indigo-100">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[85%] bg-white border border-slate-200/60 shadow-sm rounded-2xl rounded-tl-md px-4 py-3.5">
                  {msg.content ? (
                    <div className="prose prose-slate max-w-none font-sans
                      [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                      [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-200
                      [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
                      [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1
                      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1
                      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5
                      [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5
                      [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5
                      [&_li]:my-0.5 [&_li]:text-slate-700
                      [&_p]:my-2 [&_p]:leading-loose [&_p]:text-slate-700 [&_p]:text-base
                      [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs
                      [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <div className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
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
