"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE, tokenStore, readSSE, apiFetch } from "@/lib/api/base";
import { useModels } from "@/sessions/new/hooks/useModels";
import { DEFAULT_FREE_MODEL_ID } from "@/sessions/new/hooks/useNewSession";
import { useTheme } from "@/contexts/ThemeContext";

const API = `${API_BASE}/doc-parse`;
const QUEUE_SSE_BASE = `${API_BASE}/queue/doc-parse`;

function authHeaders(includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) headers["Content-Type"] = "application/json";
  const token = tokenStore.get();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (typeof window !== "undefined") {
    let anonId = localStorage.getItem("anon_id");
    if (!anonId) { anonId = crypto.randomUUID(); localStorage.setItem("anon_id", anonId); }
    headers["X-Anon-Id"] = anonId;
  }
  return headers;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  markdown?: boolean;
  streaming?: boolean;
}

type QuickAction = "translate" | "summarize" | "explain" | "keywords" | "evaluate";

const QUICK_ACTIONS: { value: QuickAction; label: string }[] = [
  { value: "evaluate", label: "평가" },
  { value: "translate", label: "번역" },
  { value: "summarize", label: "요약" },
  { value: "explain", label: "설명" },
  { value: "keywords", label: "키워드" },
];

// 마크다운 렌더 대상 액션
const MARKDOWN_ACTIONS = new Set<QuickAction>(["evaluate", "summarize"]);

const STORAGE_KEY = "doc-parse-draft";

interface DocParseDraft {
  docText: string;
  docPages: string[];
  filename: string;
  pageCount: number;
  isReady: boolean;
  messages: Message[];
  selectedModel: string;
  pdfDataUrl?: string | null;
  pendingJob?: { jobId: string; msgId: string } | null; // 큐 재연결용
}

function TypingDot() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

export default function DocParsePage() {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const { cloudAiModels, localAiModels, isLoading: modelsLoading } = useModels();
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [docText, setDocText] = useState("");
  const [docPages, setDocPages] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [filename, setFilename] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (selectedModel || modelsLoading) return;
    const haiku = cloudAiModels.find((m) => m.id === "claude-haiku-4-5");
    setSelectedModel(haiku?.id ?? cloudAiModels[0]?.id ?? DEFAULT_FREE_MODEL_ID);
  }, [cloudAiModels, modelsLoading, selectedModel]);

  const apiModel = selectedModel === DEFAULT_FREE_MODEL_ID ? "" : selectedModel;
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  // SSE 스트림 구독 — jobId → 어시스턴트 메시지 업데이트
  const subscribeToStream = useCallback(async (
    jobId: string,
    msgId: string,
    markdown: boolean,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`${QUEUE_SSE_BASE}/${jobId}/stream`, {
      headers: authHeaders(false),
      signal,
    });
    await readSSE<{ type: string; text?: string; message?: string }>(res, (event) => {
      if (event.type === "chunk" && event.text) {
        setMessages((m) => m.map((msg) =>
          msg.id === msgId ? { ...msg, content: msg.content + event.text, markdown } : msg,
        ));
        scrollToBottom();
      }
      if (event.type === "done" || event.type === "error") return true;
    });
    // 스트림 완료 → streaming 플래그 해제
    setMessages((m) => m.map((msg) => msg.id === msgId ? { ...msg, streaming: false } : msg));
    // 완료된 jobId 세션에서 제거
    savePendingJob(null);
  }, [scrollToBottom]);

  // pendingJob을 sessionStorage에 저장
  const savePendingJob = (job: { jobId: string; msgId: string } | null) => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft: DocParseDraft = JSON.parse(raw);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, pendingJob: job }));
    } catch { /* 무시 */ }
  };

  // ── 세션 복원 ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const draft: DocParseDraft = JSON.parse(raw);
        if (draft.docText) setDocText(draft.docText);
        if (draft.docPages?.length) setDocPages(draft.docPages);
        if (draft.filename) setFilename(draft.filename);
        if (draft.pageCount) setPageCount(draft.pageCount);
        if (draft.isReady) setIsReady(draft.isReady);
        if (draft.messages?.length) {
          // streaming 중이던 메시지는 완료 상태로 전환
          const restored = draft.messages.map((m) => ({ ...m, streaming: false }));
          setMessages(restored);

          // 중단된 job이 있으면 재연결
          if (draft.pendingJob) {
            const { jobId, msgId } = draft.pendingJob;
            setLoading(true);
            subscribeToStream(jobId, msgId, false)
              .catch(() => {
                setMessages((m) => m.map((msg) =>
                  msg.id === msgId && !msg.content
                    ? { ...msg, content: "연결이 끊겼습니다. 다시 시도해주세요.", streaming: false }
                    : msg,
                ));
              })
              .finally(() => setLoading(false));
          }
        }
        if (draft.selectedModel) setSelectedModel(draft.selectedModel);
        if (draft.pdfDataUrl) { setPdfDataUrl(draft.pdfDataUrl); setPdfUrl(draft.pdfDataUrl); }
      }
    } catch { /* 무시 */ }
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 세션 저장 ──
  useEffect(() => {
    if (!hydrated) return;
    if (!docText && messages.length === 0 && !filename) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const draft: DocParseDraft = {
      docText, docPages, filename, pageCount, isReady,
      messages: messages.filter((m) => !m.streaming),
      selectedModel, pdfDataUrl,
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, pdfDataUrl: null })); } catch { /* 포기 */ }
    }
  }, [hydrated, docText, docPages, filename, pageCount, isReady, messages, selectedModel, pdfDataUrl]);

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setIsReady(false);
    setDocText("");
    setDocPages([]);
    setMessages([]);
    if (pdfUrl && pdfUrl.startsWith("blob:")) URL.revokeObjectURL(pdfUrl);
    setPdfDataUrl(null);

    const objectUrl = URL.createObjectURL(file);
    setPdfUrl(objectUrl);
    setFilename(file.name);

    if (file.size < 10 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") setPdfDataUrl(reader.result); };
      reader.readAsDataURL(file);
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", headers: authHeaders(false), body: formData });
      const raw = await res.json();
      const data = (raw?.isSuccess === true && "result" in raw) ? raw.result : raw;
      const text = data.text ?? "";
      setDocText(text);
      setDocPages(Array.isArray(data.pages) ? data.pages : []);
      setPageCount(data.pageCount ?? 1);
      setIsReady(true);
      const charCount = Math.ceil(text.length / 1000);
      setMessages([{
        id: crypto.randomUUID(), role: "assistant",
        content: text
          ? `**${file.name}** 파일이 업로드되었습니다. (${data.pageCount}페이지, ${charCount}K 글자)\n\n질문하거나 아래 빠른 실행 버튼을 사용해보세요.`
          : `**${file.name}** 파일이 업로드되었습니다.\n\n텍스트를 추출하지 못했습니다. 스캔된 이미지 PDF이거나 암호화된 파일일 수 있습니다.`,
      }]);
      scrollToBottom();
    } catch {
      setIsReady(false);
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content: "파일 파싱에 실패했습니다." }]);
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
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: question }]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    const msgId = crypto.randomUUID();
    setMessages((m) => [...m, { id: msgId, role: "assistant", content: "", streaming: true }]);

    try {
      const { jobId } = await apiFetch<{ jobId: string }>("/doc-parse/ask", {
        method: "POST",
        body: JSON.stringify({ docText, question, aiModel: apiModel }),
      });
      savePendingJob({ jobId, msgId });

      abortRef.current = new AbortController();
      await subscribeToStream(jobId, msgId, false, abortRef.current.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((m) => m.map((msg) =>
          msg.id === msgId
            ? { ...msg, content: msg.content || "오류가 발생했습니다.", streaming: false }
            : msg,
        ));
      }
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const runQuickAction = async (action: QuickAction) => {
    if (!isReady || loading) return;
    const label = QUICK_ACTIONS.find((a) => a.value === action)?.label ?? action;
    const msgId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: `${label} 실행` },
      { id: msgId, role: "assistant", content: "", streaming: true, markdown: MARKDOWN_ACTIONS.has(action) },
    ]);
    setLoading(true);
    scrollToBottom();

    try {
      let jobId: string;
      if (action === "evaluate") {
        ({ jobId } = await apiFetch<{ jobId: string }>("/doc-parse/evaluate", {
          method: "POST",
          body: JSON.stringify({ pages: docPages.length > 0 ? docPages : [docText], aiModel: apiModel }),
        }));
      } else if (action === "summarize") {
        ({ jobId } = await apiFetch<{ jobId: string }>("/doc-parse/summarize-pages", {
          method: "POST",
          body: JSON.stringify({ pages: docPages.length > 0 ? docPages : [docText], aiModel: apiModel }),
        }));
      } else {
        ({ jobId } = await apiFetch<{ jobId: string }>("/doc-parse/quick-action", {
          method: "POST",
          body: JSON.stringify({ docText, action, aiModel: apiModel }),
        }));
      }
      savePendingJob({ jobId, msgId });
      await subscribeToStream(jobId, msgId, MARKDOWN_ACTIONS.has(action));
    } catch {
      setMessages((m) => m.map((msg) =>
        msg.id === msgId ? { ...msg, content: "오류가 발생했습니다.", streaming: false } : msg,
      ));
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const formatContent = (text: string) =>
    text.split("\n").map((line, i) => {
      const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      const bullet = bold.startsWith("• ") || bold.startsWith("- ")
        ? `<span class="flex gap-1.5"><span class="text-indigo-400 shrink-0">•</span><span>${bold.slice(2)}</span></span>`
        : bold;
      return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: bullet }} />;
    });

  return (
    <div className={`h-full flex flex-col overflow-hidden transition-all ${isGlass ? "p-3 bg-transparent" : isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      <div className={`flex-1 flex flex-col md:flex-row overflow-hidden ${isGlass ? "glass-panel rounded-2xl shadow-xl border " + (isDark ? "border-white/20" : "border-black/5") : ""}`}>

        {/* Left: PDF Viewer */}
        <div className={`flex-1 flex flex-col min-w-0 min-h-[40vh] md:min-h-0 border-b md:border-b-0 md:border-r ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : (isDark ? "border-slate-700" : "border-slate-200")}`}>
          <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
            <span className={`text-sm font-bold ${isDark && isGlass ? "text-slate-100" : isDark ? "text-slate-200" : "text-slate-700"}`}>문서 파싱</span>
            {filename && <span className="text-xs text-slate-400 truncate max-w-xs">{filename} {pageCount > 0 && `· ${pageCount}p`}</span>}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="ml-auto text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {uploading ? "파싱 중..." : "파일 열기"}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>

          <div className="flex-1 overflow-hidden relative" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full border-0" title="PDF Viewer" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-slate-400">
                    <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                    <path d="M8 8H16M8 12H16M8 16H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-500">파일을 여기에 끌어다 놓거나</p>
                  <p className="text-xs mt-1">PDF, TXT, MD 파일을 지원합니다</p>
                </div>
                <button onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-semibold px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
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

        {/* Right: AI Chat Panel */}
        <div className={`w-full md:w-120 shrink-0 flex flex-col overflow-hidden md:overflow-visible h-[60vh] md:h-auto ${isGlass ? "" : isDark ? "bg-slate-800" : "bg-white"}`}>
          {/* Header */}
          <div className={`px-4 py-3 border-b shrink-0 ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : (isDark ? "border-slate-700" : "border-slate-100")}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${isDark && isGlass ? "text-slate-100" : isDark ? "text-slate-200" : "text-slate-700"}`}>AI 문서 분석</span>
              <span className="text-2xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">AI</span>
            </div>
            <div className="mt-2">
              {modelsLoading ? (
                <div className="h-7 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                  className={`w-full text-xs ${isDark && isGlass ? "text-slate-100" : isDark ? "text-slate-200" : "text-slate-700"} bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer`}>
                  <option value={DEFAULT_FREE_MODEL_ID}>Gemini (기본 무료)</option>
                  {cloudAiModels.length > 0 && (
                    <optgroup label="클라우드 AI">
                      {cloudAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  )}
                  {localAiModels.length > 0 && (
                    <optgroup label="로컬 모델">
                      {localAiModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.provider === "llama-cpp" ? "llama.cpp" : "Ollama"})</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>
            {!isReady && <p className="text-xs text-slate-400 mt-1.5">문서를 먼저 업로드하세요</p>}
          </div>

          {/* Quick Actions */}
          {isReady && (
            <div className={`px-3 py-2.5 border-b shrink-0 ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : (isDark ? "border-slate-700" : "border-slate-100")}`}>
              <p className="text-2xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wider">빠른 실행</p>
              <div className="grid grid-cols-5 gap-1.5">
                {QUICK_ACTIONS.map((a) => (
                  <button key={a.value} onClick={() => runQuickAction(a.value)} disabled={loading}
                    className={`py-1.5 px-1 rounded-lg text-2xs font-semibold transition-colors disabled:opacity-40 ${
                      a.value === "evaluate"
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                        : "bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    }`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300 px-6">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-300">
                  <path d="M6 6h20v16H6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  <path d="M11 24l2-2h8l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M11 12h10M11 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                <p className="text-xs text-center">문서를 업로드하면 AI가 질문에 답변하거나 번역·요약·설명을 제공합니다</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} px-3`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs shrink-0 mt-0.5 mr-2">AI</div>
                  )}
                  <div className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm max-w-[85%] space-y-1"
                      : msg.markdown
                      ? `bg-white border border-slate-200 ${isDark && isGlass ? "text-slate-100" : isDark ? "text-slate-200" : "text-slate-700"} rounded-bl-sm w-[95%] shadow-sm`
                      : `bg-slate-50 ${isDark && isGlass ? "text-slate-100" : isDark ? "text-slate-200" : "text-slate-700"} rounded-bl-sm max-w-[85%] space-y-1`
                  }`}>
                    {msg.role === "assistant" && msg.streaming && !msg.content ? (
                      <TypingDot />
                    ) : msg.role === "assistant" && msg.markdown ? (
                      <div className="prose prose-sm prose-slate max-w-none
                        [&_table]:w-full [&_table]:border-collapse [&_table]:text-2xs [&_table]:my-2
                        [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
                        [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-slate-200
                        [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1
                        [&_h2]:text-xs [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1
                        [&_h3]:text-2xs [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5
                        [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1
                        [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5
                        [&_strong]:font-semibold [&_strong]:text-slate-900
                        [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-2xs">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        {msg.streaming && <span className="inline-block w-1 h-3.5 bg-indigo-400 animate-pulse ml-0.5" />}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {formatContent(msg.content)}
                        {msg.streaming && msg.content && (
                          <span className="inline-block w-1 h-3.5 bg-indigo-400 animate-pulse ml-0.5 align-text-bottom" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={`px-3 py-3 border-t shrink-0 ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : (isDark ? "border-slate-700" : "border-slate-100")}`}>
            <div className="flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-indigo-300 focus-within:ring-1 focus-within:ring-indigo-200 px-3 py-2 transition-all">
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                disabled={!isReady || loading}
                placeholder={isReady ? "문서에 대해 질문하세요..." : "문서를 먼저 업로드하세요"}
                rows={2}
                className={`flex-1 bg-transparent text-xs ${isDark && isGlass ? "text-slate-100" : isDark ? "text-slate-200" : "text-slate-700"} placeholder-slate-300 resize-none focus:outline-none disabled:opacity-50`}
              />
              <button onClick={() => sendMessage(input)} disabled={!isReady || loading || !input.trim()}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
                ↑
              </button>
            </div>
            <p className="text-2xs text-slate-300 mt-1.5 text-center">Enter로 전송 · Shift+Enter 줄바꿈</p>
          </div>
        </div>
      </div>
    </div>
  );
}
