"use client";

import type { RefObject } from "react";
import type { CompanyAnalysis } from "@/lib/api/company-analysis";
import { DEFAULT_FREE_MODEL_ID } from "@/sessions/new/hooks/useNewSession";

interface CloudModel { id: string; name: string }

interface Props {
  chatOpen: boolean;
  setChatOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  isChatBtnVisible: boolean;
  chatBtnRef: RefObject<HTMLButtonElement | null>;
  chatPanelRef: RefObject<HTMLDivElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  chatInputRef: RefObject<HTMLTextAreaElement | null>;
  selected: CompanyAnalysis | null;
  chatMessages: { role: "user" | "assistant"; content: string }[];
  setChatMessages: (v: { role: "user" | "assistant"; content: string }[]) => void;
  chatLoading: boolean;
  chatModel: string;
  setChatModel: (v: string) => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChatMessage: () => void;
  cloudAiModels: CloudModel[];
  localAiModels: CloudModel[];
  reliabilityOpen: boolean;
  isDark: boolean;
}

const SELECT_ARROW_SVG = 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")';

export function CompanyChatPanel({
  chatOpen, setChatOpen, isChatBtnVisible, chatBtnRef, chatPanelRef, chatEndRef, chatInputRef,
  selected, chatMessages, setChatMessages, chatLoading, chatModel, setChatModel,
  chatInput, setChatInput, sendChatMessage, cloudAiModels, localAiModels, isDark,
}: Props) {
  return (
    <>
      {/* 플로팅 채팅 버튼 */}
      <button
        ref={chatBtnRef}
        onClick={() => {
          if (!chatOpen) setChatMessages([]);
          setChatOpen((o) => !o);
        }}
        title={chatOpen ? "채팅 닫기" : "AI와 채팅"}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 ${
          chatOpen
            ? isDark ? "bg-slate-600 hover:bg-slate-500 text-white" : "bg-slate-500 hover:bg-slate-400 text-white"
            : isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-800 hover:bg-slate-700 text-white"
        } ${!isChatBtnVisible && !chatOpen ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"}`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {/* 채팅 패널 */}
      {chatOpen && (
        <div
          ref={chatPanelRef}
          className={`fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-50 h-[46dvh] min-h-[18rem] max-h-[24rem] sm:h-[520px] sm:max-h-[520px] flex flex-col rounded-lg border shadow-2xl overflow-hidden ${
            isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-300"
          }`}
        >
          {/* 헤더 */}
          <div className={`shrink-0 border-b ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${chatLoading ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`} />
                <span className={`text-sm font-semibold truncate max-w-[180px] ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  {selected ? `${selected.companyName} 어시스턴트` : "기업 분석 AI"}
                </span>
              </div>
              <button
                onClick={() => { if (confirm("대화를 초기화하시겠습니까?")) setChatMessages([]); }}
                className={`text-xs px-2 py-0.5 rounded border transition-colors shrink-0 ${isDark ? "border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-600" : "border-slate-300 text-slate-400 hover:text-red-500 hover:border-red-400"}`}
              >
                초기화
              </button>
            </div>
            <div className="px-3 pb-2.5">
              <select
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                disabled={chatLoading}
                className={`w-full text-xs px-2 py-1.5 border rounded appearance-none focus:outline-none ${isDark ? "bg-slate-900 border-slate-600 text-slate-300" : "bg-white border-slate-300 text-slate-700"}`}
                style={{ backgroundImage: SELECT_ARROW_SVG, backgroundRepeat: "no-repeat", backgroundPosition: "right .5rem top 50%", backgroundSize: ".55rem auto" }}
              >
                <option value={DEFAULT_FREE_MODEL_ID}>Gemini (기본)</option>
                {cloudAiModels.length > 0 && (
                  <optgroup label="Cloud">
                    {cloudAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                )}
                {localAiModels.length > 0 && (
                  <optgroup label="Local">
                    {localAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* 메시지 목록 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className={`text-center text-xs mt-3 sm:mt-8 leading-relaxed ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {selected
                  ? `${selected.companyName}에 대해 궁금한 점을 물어보세요.\n인재상, 재무, 문화 등을 분석해 드립니다.`
                  : "좌측에서 기업을 선택하면 해당 기업의\n분석 데이터를 바탕으로 답변합니다."}
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] text-sm px-3 py-2 rounded-2xl leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === "user"
                    ? isDark ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-800 text-white rounded-br-sm"
                    : isDark ? "bg-slate-700 text-slate-200 rounded-bl-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}>
                  {msg.content !== "" ? msg.content : (
                    <span className="flex gap-1 items-center h-4">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* 입력창 */}
          <div className={`shrink-0 border-t px-3 py-3 ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <div className={`flex items-end gap-2 border rounded-xl px-3 py-2 ${isDark ? "bg-slate-900 border-slate-600 focus-within:border-blue-500" : "bg-white border-slate-300 focus-within:border-slate-500"}`}>
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 72)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
                }}
                placeholder="메시지 입력… (Shift+Enter 줄바꿈)"
                disabled={chatLoading}
                rows={1}
                className={`flex-1 text-sm bg-transparent focus:outline-none resize-none overflow-hidden leading-relaxed ${isDark ? "text-slate-200 placeholder-slate-500" : "text-slate-800 placeholder-slate-400"}`}
                style={{ minHeight: "22px", maxHeight: "72px" }}
              />
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-800 hover:bg-slate-700 text-white"}`}
              >
                <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
