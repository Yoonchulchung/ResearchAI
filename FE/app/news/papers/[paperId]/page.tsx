"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/contexts/ThemeContext";
import { getPaperById, markPaperRead, type Paper } from "@/lib/api/papers";
import { API_BASE, getAuthHeaders, readSSE } from "@/lib/api/base";
import type PdfVisualViewerType from "../../../recruit/doc-parse/_components/PdfVisualViewer";
import type { PdfViewerPosition } from "../../../recruit/doc-parse/_components/PdfVisualViewer";

const PdfVisualViewer = dynamic<React.ComponentProps<typeof PdfVisualViewerType>>(
  () => import("../../../recruit/doc-parse/_components/PdfVisualViewer"),
  { ssr: false },
);

const DOC_PARSE_QUEUE_BASE = `${API_BASE}/queue/doc-parse`;
const paperReaderPositionCache = new Map<string, PdfViewerPosition>();

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const QUICK_ACTIONS = [
  { value: "summarize", label: "논문 요약" },
  { value: "explain", label: "핵심 아이디어" },
  { value: "translate", label: "한국어 번역" },
  { value: "keywords", label: "키워드 추출" },
] as const;

function buildDocText(paper: Paper): string {
  const authors = paper.authors.slice(0, 10).join(", ");
  return [
    `제목: ${paper.title}`,
    authors ? `저자: ${authors}` : "",
    paper.venue ? `게재: ${paper.venue}` : "",
    paper.publishedAt ? `날짜: ${paper.publishedAt.slice(0, 10)}` : "",
    paper.summary ? `\n초록:\n${paper.summary}` : "",
    paper.tags.length ? `\n키워드: ${paper.tags.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function MarkdownComponents(isDark: boolean) {
  return {
    h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-3 mt-5 text-base font-bold first:mt-0">{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-2 mt-4 text-sm font-bold first:mt-0">{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
    p: ({ children }: { children?: ReactNode }) => <p className="my-2 text-sm leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="my-2 list-disc space-y-1 pl-4 text-sm leading-relaxed">{children}</ul>,
    ol: ({ children }: { children?: ReactNode }) => <ol className="my-2 list-decimal space-y-1 pl-4 text-sm leading-relaxed">{children}</ol>,
    li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
    strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold">{children}</strong>,
    code: ({ children }: { children?: ReactNode }) => (
      <code className={`rounded px-1 py-0.5 text-xs ${isDark ? "bg-white/10 text-indigo-200" : "bg-slate-100 text-indigo-700"}`}>{children}</code>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className={`my-2 border-l-4 pl-3 text-sm ${isDark ? "border-indigo-400/40 text-white/60" : "border-indigo-200 text-slate-500"}`}>{children}</blockquote>
    ),
  };
}

// ─── Chat history API helpers ──────────────────────────────────────────────

async function fetchChatHistory(paperId: string): Promise<{ role: string; content: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/papers/${encodeURIComponent(paperId)}/chat`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as { messages: { role: string; content: string }[] };
    return Array.isArray(data.messages) ? data.messages : [];
  } catch { return []; }
}

async function saveChatHistory(paperId: string, messages: Message[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/papers/${encodeURIComponent(paperId)}/chat`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) }),
    });
  } catch { /* ignore */ }
}

async function clearChatHistory(paperId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/papers/${encodeURIComponent(paperId)}/chat`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  } catch { /* ignore */ }
}

// ──────────────────────────────────────────────────────────────────────────

export default function PaperReaderPage() {
  const params = useParams<{ paperId: string }>();
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const paperId = decodeURIComponent(params.paperId);
  const pdfProxyUrl = `${API_BASE}/papers/${encodeURIComponent(paperId)}/pdf-proxy`;

  const [paper, setPaper] = useState<Paper | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfFetchError, setPdfFetchError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"pdf" | "ai">("pdf");
  const [scrollRequest, setScrollRequest] = useState<{ page: number; id: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const pdfPositionRef = useRef<PdfViewerPosition | null>(paperReaderPositionCache.get(paperId) ?? null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const panelClass = isGlass
    ? "glass-panel border-white/20"
    : isDark
    ? "border-white/10 bg-slate-900"
    : "border-slate-200 bg-white";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  useEffect(() => {
    pdfPositionRef.current = paperReaderPositionCache.get(paperId) ?? null;
    setCurrentPage(pdfPositionRef.current?.page ?? 0);
    return () => {
      paperReaderPositionCache.delete(paperId);
    };
  }, [paperId]);

  const handlePdfPositionChange = useCallback((position: PdfViewerPosition) => {
    pdfPositionRef.current = position;
    paperReaderPositionCache.set(paperId, position);
  }, [paperId]);

  // Load paper + chat history
  useEffect(() => {
    let cancelled = false;
    getPaperById(paperId)
      .then(async (p) => {
        if (cancelled) return;
        setPaper(p);
        if (!p.readAt) {
          markPaperRead(p.id).then((updated) => {
            if (!cancelled) setPaper(updated);
          }).catch(() => {});
        }
        const stored = await fetchChatHistory(paperId);
        if (cancelled) return;
        if (stored.length > 0) {
          setMessages(stored.map((m) => ({ id: crypto.randomUUID(), role: m.role as "user" | "assistant", content: m.content })));
        } else if (p.aiSummary) {
          setMessages([{ id: crypto.randomUUID(), role: "assistant", content: p.aiSummary }]);
        }
      })
      .catch((e) => {
        if (!cancelled) setPaperError(e instanceof Error ? e.message : "논문 정보를 불러오지 못했습니다.");
      });
    return () => { cancelled = true; };
  }, [paperId]);

  // Fetch PDF blob
  useEffect(() => {
    let objectUrl: string | null = null;
    setPdfBlobUrl(null);
    setPdfFetchError(null);
    if (!paper?.pdfUrl) return;

    fetch(pdfProxyUrl, { headers: getAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(`PDF 불러오기 실패 (${res.status})`);
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/pdf")) throw new Error("서버가 PDF를 반환하지 않았습니다.");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch((e) => {
        if ((e as Error)?.name !== "AbortError") {
          setPdfFetchError(e instanceof Error ? e.message : "PDF를 불러오지 못했습니다.");
        }
      });

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [paper, pdfProxyUrl]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const runAiJob = useCallback(async (jobId: string, msgId: string) => {
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch(`${DOC_PARSE_QUEUE_BASE}/${jobId}/stream`, {
        headers: getAuthHeaders(),
        signal: abort.signal,
      });

      if (!res.ok) {
        setMessages((prev) => prev.map((msg) =>
          msg.id === msgId ? { ...msg, content: "스트림 연결 오류가 발생했습니다. 다시 시도해 주세요.", streaming: false } : msg,
        ));
        setAiLoading(false);
        return;
      }

      let errorMsg = "";
      await readSSE<{ type: string; text?: string; message?: string }>(res, (event) => {
        if (event.type === "chunk" && event.text) {
          setMessages((m) => m.map((msg) =>
            msg.id === msgId ? { ...msg, content: msg.content + event.text } : msg,
          ));
          scrollToBottom();
        }
        if (event.type === "error") { errorMsg = event.message ?? "오류가 발생했습니다."; return true; }
        if (event.type === "done") return true;
      });

      setMessages((prev) => {
        const next = prev.map((msg) => {
          if (msg.id !== msgId) return msg;
          const content = msg.content || errorMsg || "응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.";
          return { ...msg, content, streaming: false };
        });
        saveChatHistory(paperId, next.filter((m) => !m.streaming));
        return next;
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") { setAiLoading(false); return; }
      setMessages((prev) => prev.map((msg) =>
        msg.id === msgId ? { ...msg, content: "오류가 발생했습니다.", streaming: false } : msg,
      ));
    }
    setAiLoading(false);
  }, [scrollToBottom, paperId]);

  const extractPageText = useCallback(async (pageIndex: number): Promise<string> => {
    if (!pdfBlobUrl) return "";
    try {
      const { pdfjs } = await import("react-pdf");
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
      const pdfDoc = await pdfjs.getDocument(pdfBlobUrl).promise;
      const page = await pdfDoc.getPage(pageIndex + 1);
      const textContent = await page.getTextContent();
      pdfDoc.destroy();
      return textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return "";
    }
  }, [pdfBlobUrl]);

  const sendMessage = useCallback(async (question: string, customDocText?: string) => {
    if (!paper || !question.trim() || aiLoading) return;
    const docText = customDocText ?? buildDocText(paper);
    const userMsgId = crypto.randomUUID();
    const asstMsgId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: userMsgId, role: "user", content: question },
      { id: asstMsgId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setAiLoading(true);
    scrollToBottom();
    try {
      const res = await fetch(`${DOC_PARSE_QUEUE_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ docText, question }),
      });
      const body = await res.json() as { result?: { jobId: string }; jobId?: string };
      const jobId = body.result?.jobId ?? body.jobId ?? "";
      await runAiJob(jobId, asstMsgId);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setMessages((m) => m.map((msg) =>
        msg.id === asstMsgId ? { ...msg, content: "오류가 발생했습니다.", streaming: false } : msg,
      ));
      setAiLoading(false);
    }
  }, [paper, aiLoading, runAiJob, scrollToBottom]);

  const runQuickAction = useCallback(async (action: string) => {
    if (!paper || aiLoading) return;
    const docText = buildDocText(paper);
    const label = QUICK_ACTIONS.find((a) => a.value === action)?.label ?? action;
    const userMsgId = crypto.randomUUID();
    const asstMsgId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: userMsgId, role: "user", content: label },
      { id: asstMsgId, role: "assistant", content: "", streaming: true },
    ]);
    setAiLoading(true);
    scrollToBottom();
    try {
      const res = await fetch(`${DOC_PARSE_QUEUE_BASE}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ docText, action }),
      });
      const body = await res.json() as { result?: { jobId: string }; jobId?: string };
      const jobId = body.result?.jobId ?? body.jobId ?? "";
      await runAiJob(jobId, asstMsgId);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setMessages((m) => m.map((msg) =>
        msg.id === asstMsgId ? { ...msg, content: "오류가 발생했습니다.", streaming: false } : msg,
      ));
      setAiLoading(false);
    }
  }, [paper, aiLoading, runAiJob, scrollToBottom]);

  const handleClearChat = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    abortRef.current?.abort();
    setAiLoading(false);
    setMessages([]);
    await clearChatHistory(paperId);
    setClearing(false);
  }, [clearing, paperId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  // PDF download
  const handleDownload = useCallback(() => {
    if (!pdfBlobUrl || !paper) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = `${paper.id.replace(/[:/\\]/g, "_")}.pdf`;
    a.click();
  }, [pdfBlobUrl, paper]);

  const markdownComponents = MarkdownComponents(isDark);

  const aiPanel = (
    <div className={`flex h-full flex-col border-l ${isDark ? "border-white/10" : "border-slate-200"}`}>
      {/* Quick actions + clear */}
      <div className={`border-b px-4 py-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
        <div className="mb-2 flex items-center justify-between">
          <p className={`text-xs font-semibold uppercase tracking-wide ${textSub}`}>빠른 분석</p>
          <button
            onClick={handleClearChat}
            disabled={clearing || messages.length === 0}
            className={`text-xs transition disabled:opacity-40 ${isDark ? "text-white/35 hover:text-white/70" : "text-slate-400 hover:text-slate-600"}`}
            title="대화 초기화"
          >
            대화 초기화
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.value}
              onClick={() => runQuickAction(action.value)}
              disabled={aiLoading || !paper}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${isDark ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20" : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className={`flex h-full items-center justify-center text-sm ${textSub}`}>
            <p className="text-center">논문의 초록을 기반으로 AI에게 질문하거나<br />위의 빠른 분석 버튼을 사용해 보세요.</p>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white">
                  {msg.content}
                </div>
              ) : (
                <div className={`max-w-[92%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 ${isDark ? "bg-white/8 text-white/90" : "bg-slate-100 text-slate-800"}`}>
                  {msg.streaming && !msg.content ? (
                    <div className="flex items-center gap-1 py-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {msg.content + (msg.streaming ? "▋" : "")}
                    </ReactMarkdown>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`border-t px-4 py-3 ${isDark ? "border-white/10" : "border-slate-100"}`}>
        <div className={`flex items-end gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={aiLoading || !paper}
            placeholder="논문에 대해 질문하세요..."
            rows={1}
            className={`min-h-6 flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-50 ${textMain}`}
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={aiLoading || !paper || !input.trim()}
            className="rounded-lg bg-indigo-600 p-1.5 text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8L14 8M14 8L9 3M14 8L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {aiLoading && (
          <button onClick={() => { abortRef.current?.abort(); setAiLoading(false); }} className={`mt-1.5 text-xs ${textSub} hover:underline`}>
            중지
          </button>
        )}
      </div>
    </div>
  );

  const pdfPanel = (
    <div className="flex h-full flex-col">
      {pdfBlobUrl ? (
        <PdfVisualViewer
          file={pdfBlobUrl}
          onPageChange={setCurrentPage}
          initialPosition={pdfPositionRef.current}
          onPositionChange={handlePdfPositionChange}
          onAnalyzePage={async (page: number) => {
            setMobileTab("ai");
            const pageText = await extractPageText(page);
            const docText = pageText.length > 50 ? pageText : buildDocText(paper!);
            sendMessage(`${page + 1}페이지를 분석해줘. 주요 내용과 핵심 개념을 정리해줘.`, docText);
          }}
          scrollRequest={scrollRequest}
          disabled={aiLoading}
        />
      ) : pdfFetchError ? (
        <div className={`flex h-full flex-col items-center justify-center gap-3 text-sm ${textSub}`}>
          <p>{pdfFetchError}</p>
          {paper?.pdfUrl && (
            <a href={paper.pdfUrl} target="_blank" rel="noreferrer" className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              원본에서 직접 열기
            </a>
          )}
        </div>
      ) : paperError ? (
        <div className={`flex h-full items-center justify-center text-sm ${textSub}`}>{paperError}</div>
      ) : paper && !paper.pdfUrl ? (
        <div className={`flex h-full items-center justify-center text-sm ${textSub}`}>이 논문의 PDF를 찾을 수 없습니다.</div>
      ) : (
        <div className={`flex h-full items-center justify-center text-sm ${textSub}`}>
          <span className="animate-pulse">PDF 불러오는 중...</span>
        </div>
      )}
    </div>
  );

  const pageBase = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";

  return (
    <div className={`flex h-screen flex-col ${pageBase}`}>
      {/* Header */}
      <header className={`flex shrink-0 items-center gap-3 border-b px-4 py-3 ${isDark ? "border-white/10 bg-slate-900/80" : "border-slate-200 bg-white/90"} backdrop-blur-sm`}>
        <button
          onClick={() => router.back()}
          className={`rounded-lg p-1.5 transition ${isDark ? "text-white/50 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-800"}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          {paper ? (
            <>
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>
                  {paper.sourceName}
                </span>
                {paper.venue && <span className={`text-2xs ${textSub}`}>{paper.venue}</span>}
                {typeof paper.upvotes === "number" && (
                  <span className={`text-2xs font-semibold ${isDark ? "text-amber-300" : "text-amber-600"}`}>▲ {paper.upvotes}</span>
                )}
              </div>
              <h1 className={`mt-0.5 truncate text-sm font-semibold ${textMain}`}>{paper.title}</h1>
            </>
          ) : (
            <div className={`h-4 w-64 animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
          )}
        </div>
        {paper?.pdfUrl && (
          <span className={`shrink-0 text-xs ${textSub}`}>{currentPage + 1}p</span>
        )}
        {/* PDF download */}
        {pdfBlobUrl && (
          <button
            onClick={handleDownload}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            title="PDF 다운로드"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="inline-block align-[-1px]">
              <path d="M8 2v8M8 10l-3-3M8 10l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="ml-1 hidden sm:inline">PDF</span>
          </button>
        )}
        {paper?.url && (
          <a href={paper.url} target="_blank" rel="noreferrer" className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            원문
          </a>
        )}
      </header>

      {/* Mobile tab bar */}
      <div className={`flex shrink-0 border-b md:hidden ${isDark ? "border-white/10" : "border-slate-200"}`}>
        {(["pdf", "ai"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition ${
              mobileTab === tab
                ? isDark ? "border-b-2 border-indigo-400 text-white" : "border-b-2 border-indigo-600 text-indigo-700"
                : textSub
            }`}
          >
            {tab === "pdf" ? "PDF 뷰어" : "AI 분석"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* Desktop: side-by-side */}
        <div className="hidden h-full md:flex">
          <div className={`w-1/2 border-r ${isDark ? "border-white/10" : "border-slate-200"}`}>
            {pdfPanel}
          </div>
          <div className="w-1/2">
            {aiPanel}
          </div>
        </div>

        {/* Mobile: tab content */}
        <div className="flex h-full flex-col md:hidden">
          {mobileTab === "pdf" ? pdfPanel : aiPanel}
        </div>
      </div>
    </div>
  );
}
