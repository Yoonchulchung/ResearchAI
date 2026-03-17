"use client";

import { useEffect, useRef, useState } from "react";
import { Task } from "@/types";
import { chatTasks } from "@/lib/api/ai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function TaskChatBar({
  topic,
  model,
  tasks,
  onTasksReplace,
}: {
  topic: string;
  model?: string;
  tasks: Task[];
  onTasksReplace: (tasks: Task[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canChat = !!topic.trim() && !!model && tasks.length > 0;

  useEffect(() => {
    if (expanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, expanded]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !canChat || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setExpanded(true);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const taskPayload = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        webSearchPrompt: t.webSearchPrompt,
      }));
      const { tasks: newTasks, reply } = await chatTasks(
        topic,
        taskPayload,
        text,
        model!,
        history,
      );
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      onTasksReplace(newTasks as Task[]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "오류가 발생했습니다. 다시 시도해 주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
      {/* Message history */}
      {expanded && messages.length > 0 && (
        <div className="max-h-56 overflow-y-auto px-6 py-3 space-y-2 border-b border-slate-100">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-2 text-sm ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <span className="shrink-0 text-base leading-none mt-0.5">✨</span>
              )}
              <span
                className={`max-w-[80%] px-3 py-1.5 rounded-xl leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {msg.content}
              </span>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <span className="text-base leading-none mt-0.5">✨</span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-sm">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                </span>
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-6 py-3">
        {messages.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "접기" : "펼치기"}
            className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors text-xs"
          >
            {expanded ? "▼" : "▲"}
          </button>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canChat || loading}
          placeholder={
            !topic.trim()
              ? "주제를 먼저 입력하세요"
              : tasks.length === 0
              ? "조사 항목을 먼저 생성하세요"
              : "조사 항목을 수정하도록 AI에게 요청하세요 (예: '채용 공고 관련 항목 추가해줘')"
          }
          className="flex-1 min-w-0 text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSend}
          disabled={!canChat || !input.trim() || loading}
          className="shrink-0 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            "전송"
          )}
        </button>
      </div>
    </div>
  );
}
