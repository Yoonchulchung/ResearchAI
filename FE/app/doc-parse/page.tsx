"use client";

import { useState, useRef, useCallback } from "react";
import { API_BASE } from "@/lib/api/base";

const API = `${API_BASE}/doc-parse`;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type QuickAction = "translate" | "summarize" | "explain" | "keywords";

const QUICK_ACTIONS: { value: QuickAction; label: string; icon: string }[] = [
  { value: "translate", label: "번역", icon: "🌐" },
  { value: "summarize", label: "요약", icon: "📋" },
  { value: "explain", label: "설명", icon: "💡" },
  { value: "keywords", label: "키워드", icon: "🔑" },
];

function TypingDot() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function DocParsePage() {
  const [docText, setDocText] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [filename, setFilename] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setIsReady(false);
    setDocText("");
    setMessages([]);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);

    // Show PDF in iframe
    const objectUrl = URL.createObjectURL(file);
    setPdfUrl(objectUrl);
    setFilename(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      const text = data.text ?? "";
      setDocText(text);
      setPageCount(data.pageCount ?? 1);
      setIsReady(true);
      const charCount = Math.ceil(text.length / 1000);
      setMessages([{
        id: crypto.randomUUID(),
        role: "assistant",
        content: text
          ? `📄 **${file.name}** 파일이 업로드되었습니다. (${data.pageCount}페이지, ${charCount}K 글자)\n\n질문하거나 아래 빠른 실행 버튼을 사용해보세요.`
          : `📄 **${file.name}** 파일이 업로드되었습니다.\n\n⚠️ 텍스트를 추출하지 못했습니다. 스캔된 이미지 PDF이거나 암호화된 파일일 수 있습니다.`,
      }]);
      scrollToBottom();
    } catch {
      setIsReady(false);
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content: "⚠️ 파일 파싱에 실패했습니다. PDF 또는 텍스트 파일을 사용해주세요." }]);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const sendMessage = async (question: string) => {
    if (!question.trim() || !isReady || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docText, question }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: data.answer ?? "답변을 가져오지 못했습니다." }]);
    } catch {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: "⚠️ 오류가 발생했습니다." }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const runQuickAction = async (action: QuickAction) => {
    if (!isReady || loading) return;
    const label = QUICK_ACTIONS.find((a) => a.value === action)?.label ?? action;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: `📌 ${label} 실행` };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch(`${API}/quick-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docText, action }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: data.answer ?? "결과를 가져오지 못했습니다." }]);
    } catch {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: "⚠️ 오류가 발생했습니다." }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const formatContent = (text: string) => {
    return text
      .split("\n")
      .map((line, i) => {
        const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        const bullet = bold.startsWith("• ") || bold.startsWith("- ")
          ? `<span class="flex gap-1.5"><span class="text-indigo-400 shrink-0">•</span><span>${bold.slice(2)}</span></span>`
          : bold;
        return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: bullet }} />;
      });
  };

  return (
    <div className="h-full flex overflow-hidden bg-slate-50">
      {/* ── Left: PDF Viewer ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <span className="text-sm font-bold text-slate-700">📄 문서 파싱</span>
          {filename && (
            <span className="text-xs text-slate-400 truncate max-w-xs">
              {filename} {pageCount > 0 && `· ${pageCount}p`}
            </span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="ml-auto text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? "파싱 중..." : "파일 열기"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>

        {/* Viewer */}
        <div
          className="flex-1 overflow-hidden relative"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="PDF Viewer"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center text-4xl">
                📄
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-500">파일을 여기에 끌어다 놓거나</p>
                <p className="text-xs mt-1">PDF, TXT, MD 파일을 지원합니다</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-semibold px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
              >
                파일 선택
              </button>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm font-medium">문서 파싱 중...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: AI Chat Panel ───────────────────────────── */}
      <div className="w-[400px] shrink-0 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700">AI 문서 분석</span>
            <span className="text-2xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">AI</span>
          </div>
          {!isReady && (
            <p className="text-xs text-slate-400 mt-1">문서를 먼저 업로드하세요</p>
          )}
        </div>

        {/* Quick Actions */}
        {isReady && (
          <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
            <p className="text-2xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wider">빠른 실행</p>
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => runQuickAction(a.value)}
                  disabled={loading}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition-colors disabled:opacity-40"
                >
                  <span className="text-lg">{a.icon}</span>
                  <span className="text-2xs font-semibold">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300 px-6">
              <span className="text-4xl">💬</span>
              <p className="text-xs text-center">문서를 업로드하면 AI가 질문에 답변하거나 번역·요약·설명을 제공합니다</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} px-3`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs shrink-0 mt-0.5 mr-2">
                    AI
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed space-y-1 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-slate-50 text-slate-700 rounded-bl-sm"
                  }`}
                >
                  {formatContent(msg.content)}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start px-3">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs shrink-0 mt-0.5 mr-2">AI</div>
              <div className="bg-slate-50 rounded-2xl rounded-bl-sm">
                <TypingDot />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-3 border-t border-slate-100 shrink-0">
          <div className="flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-indigo-300 focus-within:ring-1 focus-within:ring-indigo-200 px-3 py-2 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              disabled={!isReady || loading}
              placeholder={isReady ? "문서에 대해 질문하세요..." : "문서를 먼저 업로드하세요"}
              rows={2}
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-300 resize-none focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!isReady || loading || !input.trim()}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
            >
              ↑
            </button>
          </div>
          <p className="text-2xs text-slate-300 mt-1.5 text-center">Enter로 전송, Shift+Enter로 줄바꿈</p>
        </div>
      </div>
    </div>
  );
}
