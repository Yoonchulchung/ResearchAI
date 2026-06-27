"use client";

import { useRef, useState } from "react";
import { API_BASE } from "@/lib/api/base";

interface RelatedCompany {
  name: string;
  stockCode?: string | null;
  industry?: string | null;
  relation?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  companies?: RelatedCompany[];
  loading?: boolean;
}

const SUGGESTIONS = [
  "로봇 부품 관련 국내 중소형 회사",
  "삼성전자 1차 부품 납품 업체",
  "LG이노텍 FTA 미체결국 관련 협약",
  "이차전지 양극재 공급망 기업",
  "방산 수출 관련 부품 회사",
];

export function StockResearchChat({ isDark }: { isDark: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const border = isDark ? "border-slate-800" : "border-slate-200";
  const bg = isDark ? "bg-slate-900" : "bg-white";
  const inputBg = isDark ? "bg-slate-800 text-slate-100 placeholder:text-slate-500" : "bg-slate-50 text-slate-800 placeholder:text-slate-400";
  const userBubble = isDark ? "bg-indigo-600 text-white" : "bg-indigo-600 text-white";
  const aiBubble = isDark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-800";

  const scrollToBottom = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  const send = (query: string) => {
    if (!query.trim() || streaming) return;
    esRef.current?.close();

    const userMsg: Message = { role: "user", content: query };
    const aiMsg: Message = { role: "assistant", content: "", loading: true };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setStreaming(true);
    scrollToBottom();

    const es = new EventSource(
      `${API_BASE}/financial/research/stream?q=${encodeURIComponent(query)}`,
    );
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as {
          type: string; text?: string;
          companies?: RelatedCompany[]; error?: string;
        };

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          if (data.type === "text") {
            return [...prev.slice(0, -1), { ...last, content: last.content + (data.text ?? ""), loading: false }];
          }
          if (data.type === "companies" && data.companies) {
            return [...prev.slice(0, -1), { ...last, companies: data.companies, loading: false }];
          }
          if (data.type === "done" || data.type === "error") {
            const content = data.type === "error"
              ? `오류가 발생했습니다: ${data.error}`
              : last.content;
            return [...prev.slice(0, -1), { ...last, content, loading: false }];
          }
          return prev;
        });

        if (data.type === "done" || data.type === "error") {
          es.close(); setStreaming(false); scrollToBottom();
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      es.close();
      setStreaming(false);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [...prev.slice(0, -1), { ...last, content: last.content || "연결이 끊어졌습니다.", loading: false }];
      });
    };
  };

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-2xl border ${border} ${bg} shadow-sm`}>
      {/* 헤더 */}
      <div className={`shrink-0 border-b px-4 py-3.5 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs ${isDark ? "bg-indigo-500/20 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>
            ✦
          </span>
          <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>종목 리서치</h2>
          <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>공급망 · 협약 · 관계 분석</span>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-6">
            <p className={`text-center text-xs leading-relaxed ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              기업 공급망, 납품 관계, FTA 협약,<br />테마 종목 등을 자연어로 검색하세요.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    isDark
                      ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${msg.role === "user" ? userBubble : aiBubble}`}>
              {msg.loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
                </span>
              ) : (
                <>
                  {msg.companies && msg.companies.length > 0 && (
                    <div className={`mb-2.5 flex flex-wrap gap-1.5`}>
                      {msg.companies.map((c, ci) => (
                        <span
                          key={ci}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold ${
                            isDark ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300" : "border-indigo-200 bg-indigo-50 text-indigo-700"
                          }`}
                        >
                          {c.name}
                          {c.stockCode && <span className="opacity-60">{c.stockCode}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <div className={`shrink-0 border-t p-3 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
        <div className={`flex items-end gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            placeholder="예: 로봇 부품 납품 중소기업, LG이노텍 협약..."
            disabled={streaming}
            className={`flex-1 resize-none bg-transparent text-xs outline-none leading-relaxed ${inputBg} disabled:opacity-50`}
            style={{ minHeight: "20px" }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            {streaming ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
