"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE, tokenStore, readSSE, apiFetch } from "@/lib/api/base";
import {
  clearPdfDraftFile,
  dataUrlToBlobUrl,
  loadPdfDraftFile,
  pdfFileCache,
  savePdfDraftFile,
} from "@/lib/cache/pdfFileCache";
import { useModels } from "@/sessions/new/hooks/useModels";
import { DEFAULT_FREE_MODEL_ID } from "@/sessions/new/hooks/useNewSession";
import { useTheme } from "@/contexts/ThemeContext";
import { createId } from "@/lib/crypto";

const PdfVisualViewer = dynamic(() => import("./_components/PdfVisualViewer"), { ssr: false });

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
    if (!anonId) { anonId = createId(); localStorage.setItem("anon_id", anonId); }
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
  { value: "evaluate", label: "포트폴리오 평가" },
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
  const [currentPage, setCurrentPage] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [filename, setFilename] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const isRestoringRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) isRestoringRef.current = true;
    } catch { /* 무시 */ }
  }, []);

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
  const [viewMode, setViewMode] = useState<"visual" | "text">("visual");
  const [scrollRequest, setScrollRequest] = useState<{ page: number; id: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const textScrollRafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const restorePdfSourceFromCache = useCallback(async () => {
    const cachedFile = pdfFileCache.get() ?? await loadPdfDraftFile().catch(() => null);
    if (!cachedFile) return false;

    pdfFileCache.set(cachedFile);
    setPdfFile(cachedFile);
    setPdfDataUrl((current) => current);
    setPdfUrl((current) => {
      if (current) return current;
      return URL.createObjectURL(cachedFile);
    });
    return true;
  }, []);

  const scrollToPage = useCallback((page: number) => {
    setCurrentPage(page);
    // visual 모드는 PdfVisualViewer의 scrollRequest로, text 모드는 pageRefs로 처리
    setScrollRequest((prev) => ({ page, id: (prev?.id ?? 0) + 1 }));
    if (viewMode === "text") {
      pageRefs.current[page]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [viewMode]);

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

  // ── 텍스트 뷰에서 현재 보이는 페이지 추적 ──
  useEffect(() => {
    if (!docPages.length || viewMode !== "text" || !textContainerRef.current) return;
    const root = textContainerRef.current;
    const updateCurrentTextPage = () => {
      const rootRect = root.getBoundingClientRect();
      const focusY = rootRect.top + rootRect.height * 0.32;
      let bestIndex = -1;
      let bestScore = Number.POSITIVE_INFINITY;

      pageRefs.current.slice(0, docPages.length).forEach((page, index) => {
        if (!page) return;
        const rect = page.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, rootRect.top);
        const visibleBottom = Math.min(rect.bottom, rootRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        if (visibleHeight <= 0) return;

        const containsFocus = rect.top <= focusY && rect.bottom >= focusY;
        const edgeDistance = containsFocus
          ? 0
          : Math.min(Math.abs(rect.top - focusY), Math.abs(rect.bottom - focusY));
        const score = edgeDistance - visibleHeight * 0.001;

        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      if (bestIndex !== -1) {
        setCurrentPage((prev) => (prev === bestIndex ? prev : bestIndex));
      }
    };

    const scheduleTextPageCheck = () => {
      if (textScrollRafRef.current !== null) return;
      textScrollRafRef.current = requestAnimationFrame(() => {
        textScrollRafRef.current = null;
        updateCurrentTextPage();
      });
    };

    root.addEventListener("scroll", scheduleTextPageCheck, { passive: true });
    window.addEventListener("resize", scheduleTextPageCheck);
    scheduleTextPageCheck();

    return () => {
      root.removeEventListener("scroll", scheduleTextPageCheck);
      window.removeEventListener("resize", scheduleTextPageCheck);
      if (textScrollRafRef.current !== null) cancelAnimationFrame(textScrollRafRef.current);
      textScrollRafRef.current = null;
    };
  }, [docPages, viewMode]);

  // ── 세션 복원 ──
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
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

          // IndexedDB 캐시 복원 비동기 처리
          const cachedFile = pdfFileCache.get() ?? await loadPdfDraftFile().catch(() => null);

          if (!cancelled) {
            if (cachedFile) {
              pdfFileCache.set(cachedFile);
              setPdfFile(cachedFile);
              const blobUrl = URL.createObjectURL(cachedFile);
              setPdfUrl(blobUrl);
              if (draft.pdfDataUrl) setPdfDataUrl(draft.pdfDataUrl);
            } else if (draft.pdfDataUrl) {
              setPdfDataUrl(draft.pdfDataUrl);
              try {
                const blobUrl = await dataUrlToBlobUrl(draft.pdfDataUrl);
                if (!cancelled) setPdfUrl(blobUrl);
              } catch {
                if (!cancelled) setPdfUrl(draft.pdfDataUrl);
              }
            }
          }

          if (draft.isReady && draft.docPages?.length) setViewMode("visual");
        }
      } catch { /* 무시 */ }

      if (!cancelled) {
        setHydrated(true);
        // React의 상태 배칭 리렌더링이 완전히 브라우저 프레임에 바인딩된 후 락을 해제
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 120);
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [restorePdfSourceFromCache, subscribeToStream]);

  // ── 세션 저장 ──
  useEffect(() => {
    if (!hydrated) return;
    if (isRestoringRef.current) return; // 복원 중의 불안정한 과도기 상태일 때는 저장을 방어하여 지우기 조건 차단
    
    // 복원 도중이나 상태 로드 지연 시 기존 캐시가 자폭 청소되는 것을 방지하기 위해 조기 리턴으로 철통 보호
    if (!docText && messages.length === 0 && !filename) {
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
    setCurrentPage(0);
    setMessages([]);
    if (pdfUrl && pdfUrl.startsWith("blob:")) URL.revokeObjectURL(pdfUrl);
    setPdfFile(file);
    setPdfDataUrl(null);

    const objectUrl = URL.createObjectURL(file);
    setPdfUrl(objectUrl);
    setFilename(file.name);
    pdfFileCache.set(file);
    void savePdfDraftFile(file).catch(() => undefined);

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
      if (Array.isArray(data.pages) && data.pages.length > 0) setViewMode("visual");
      const charCount = Math.ceil(text.length / 1000);
      setMessages([{
        id: createId(), role: "assistant",
        content: text
          ? `**${file.name}** 파일이 업로드되었습니다. (${data.pageCount}페이지, ${charCount}K 글자)\n\n질문하거나 아래 빠른 실행 버튼을 사용해보세요.`
          : `**${file.name}** 파일이 업로드되었습니다.\n\n텍스트를 추출하지 못했습니다. 스캔된 이미지 PDF이거나 암호화된 파일일 수 있습니다.`,
      }]);
      scrollToBottom();
    } catch {
      setIsReady(false);
      setMessages([{ id: createId(), role: "assistant", content: "파일 파싱에 실패했습니다." }]);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !isReady || viewMode !== "visual") return;
    if (pdfFile || pdfUrl || pdfDataUrl) return;
    void restorePdfSourceFromCache();
  }, [hydrated, isReady, pdfDataUrl, pdfFile, pdfUrl, restorePdfSourceFromCache, viewMode]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const sendMessage = async (question: string) => {
    if (!question.trim() || !isReady || loading) return;
    setMessages((m) => [...m, { id: createId(), role: "user", content: question }]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    const msgId = createId();
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
    const msgId = createId();
    setMessages((m) => [
      ...m,
      { id: createId(), role: "user", content: `${label} 실행` },
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

  const analyzeCurrentPage = async (targetPage?: number) => {
    const page = targetPage ?? currentPage;
    const pageText = docPages[page] ?? docText;
    if (!pageText.trim() || !isReady || loading) return;

    const msgId = createId();
    setMessages((m) => [
      ...m,
      { id: createId(), role: "user", content: `${page + 1}페이지 분석` },
      { id: msgId, role: "assistant", content: "", streaming: true, markdown: true },
    ]);
    setLoading(true);
    scrollToBottom();

    try {
      const { jobId } = await apiFetch<{ jobId: string }>("/doc-parse/ask", {
        method: "POST",
        body: JSON.stringify({
          docText: pageText,
          question: `이 문서를 분석해 주세요. 주요 내용, 핵심 항목, 특이사항을 마크다운으로 정리해 주세요.`,
          aiModel: apiModel,
        }),
      });
      savePendingJob({ jobId, msgId });
      abortRef.current = new AbortController();
      await subscribeToStream(jobId, msgId, true, abortRef.current.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((m) =>
          m.map((msg) => msg.id === msgId ? { ...msg, content: "오류가 발생했습니다.", streaming: false } : msg),
        );
      }
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

  const pdfViewerFile = pdfFile ?? pdfDataUrl ?? pdfUrl;

  if (!hydrated) {
    return (
      <div className={`h-full flex flex-col overflow-hidden transition-all ${isGlass ? "p-3 bg-transparent" : isDark ? "bg-slate-900" : "bg-slate-50"}`}>
        <div className={`flex-1 flex flex-col md:flex-row overflow-hidden ${isGlass ? "glass-panel rounded-2xl shadow-xl border " + (isDark ? "border-white/20" : "border-black/5") : "rounded-2xl border " + (isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}`}>
          
          {/* Left Panel: 뷰어 스켈레톤 */}
          <div className={`flex-1 flex flex-col min-w-0 min-h-[40vh] md:min-h-0 border-b md:border-b-0 md:border-r ${isDark ? "border-slate-800" : "border-slate-200"}`}>
            {/* Top Toolbar */}
            <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50/50"}`}>
              <div className="flex items-center gap-2">
                <div className={`h-4 w-16 rounded-md animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                <div className={`h-3.5 w-24 rounded-md animate-pulse ${isDark ? "bg-slate-800/60" : "bg-slate-200/60"}`} />
              </div>
              <div className={`h-7 w-20 rounded-lg animate-pulse ${isDark ? "bg-indigo-950/40" : "bg-indigo-50"}`} />
            </div>
            {/* Big Content Body */}
            <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4 overflow-hidden relative">
              <div className={`w-3/4 max-w-lg h-5/6 rounded-xl border border-dashed flex flex-col items-center justify-center p-6 gap-4 animate-pulse ${isDark ? "border-slate-800 bg-slate-950/20" : "border-slate-200 bg-slate-100/10"}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                <div className="w-full flex flex-col items-center gap-2">
                  <div className={`h-3 w-1/2 rounded-md ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                  <div className={`h-2.5 w-1/3 rounded-md ${isDark ? "bg-slate-800/60" : "bg-slate-200/60"}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: AI 대화창 스켈레톤 */}
          <div className={`w-full md:w-120 shrink-0 flex flex-col overflow-hidden h-[60vh] md:h-auto ${isDark ? "bg-slate-800/30" : "bg-slate-50/20"}`}>
            {/* Top Select Bar */}
            <div className={`px-4 py-3.5 border-b shrink-0 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <div className={`h-4 w-20 rounded-md animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                <div className={`h-3.5 w-6 rounded-full animate-pulse ${isDark ? "bg-indigo-950/60" : "bg-indigo-100"}`} />
              </div>
              <div className={`mt-2.5 h-8 w-full rounded-lg animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
            </div>
            {/* Messages Body */}
            <div className="flex-1 p-4 space-y-4 overflow-hidden">
              {/* Message 1 (AI) */}
              <div className="flex justify-start gap-2.5">
                <div className={`w-6 h-6 rounded-full shrink-0 animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                <div className="flex-1 space-y-2 max-w-[80%]">
                  <div className={`h-3 w-2/3 rounded-md animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                  <div className={`h-3 w-5/6 rounded-md animate-pulse ${isDark ? "bg-slate-800/70" : "bg-slate-200/70"}`} />
                  <div className={`h-3 w-1/2 rounded-md animate-pulse ${isDark ? "bg-slate-800/50" : "bg-slate-200/50"}`} />
                </div>
              </div>
              {/* Message 2 (User) */}
              <div className="flex justify-end">
                <div className="space-y-2 w-1/2 flex flex-col items-end">
                  <div className={`h-3 w-full rounded-md animate-pulse ${isDark ? "bg-indigo-950/60" : "bg-indigo-100"}`} />
                  <div className={`h-3 w-3/4 rounded-md animate-pulse ${isDark ? "bg-indigo-950/40" : "bg-indigo-50"} mt-2`} />
                </div>
              </div>
              {/* Message 3 (AI) */}
              <div className="flex justify-start gap-2.5">
                <div className={`w-6 h-6 rounded-full shrink-0 animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                <div className="flex-1 space-y-2 max-w-[70%]">
                  <div className={`h-3 w-full rounded-md animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                  <div className={`h-3 w-2/3 rounded-md animate-pulse ${isDark ? "bg-slate-800/70" : "bg-slate-200/70"}`} />
                </div>
              </div>
            </div>
            {/* Input Bar */}
            <div className={`p-3 border-t shrink-0 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <div className={`h-16 w-full rounded-xl animate-pulse ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
              <div className={`mt-2 h-2.5 w-1/3 mx-auto rounded-md animate-pulse ${isDark ? "bg-slate-800/50" : "bg-slate-200/50"}`} />
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col overflow-hidden transition-all ${isGlass ? "p-3 bg-transparent" : isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      <div className={`flex-1 flex flex-col md:flex-row overflow-hidden ${isGlass ? "glass-panel rounded-2xl shadow-xl border " + (isDark ? "border-white/20" : "border-black/5") : ""}`}>

        {/* Left: 문서 뷰어 */}
        <div className={`flex-1 flex flex-col min-w-0 min-h-[40vh] md:min-h-0 border-b md:border-b-0 md:border-r ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : (isDark ? "border-slate-700" : "border-slate-200")}`}>
          <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
            <span className={`text-sm font-bold shrink-0 ${isDark && isGlass ? "text-slate-100" : isDark ? "text-slate-200" : "text-slate-700"}`}>문서 파싱</span>
            {filename && <span className="text-xs text-slate-400 truncate max-w-32">{filename} {pageCount > 0 && `· ${pageCount}p`}</span>}
            {/* 시각적 ↔ 텍스트 뷰 토글 */}
            {isReady && docPages.length > 0 && (
              <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-200 text-xs">
                <button onClick={() => setViewMode("visual")} className={`px-2.5 py-1 font-semibold transition-colors ${viewMode === "visual" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>시각적</button>
                <button onClick={() => setViewMode("text")} className={`px-2.5 py-1 font-semibold transition-colors ${viewMode === "text" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>텍스트</button>
              </div>
            )}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className={`${isReady && docPages.length > 0 && pdfViewerFile ? "" : "ml-auto"} shrink-0 text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors`}>
              {uploading ? "파싱 중..." : "파일 열기"}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>

          <div className="flex-1 overflow-hidden relative" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>

            {/* 시각적 PDF 뷰 — react-pdf 캔버스 렌더링 */}
            {viewMode === "visual" && pdfViewerFile && (
              <PdfVisualViewer
                file={pdfViewerFile}
                onPageChange={setCurrentPage}
                onAnalyzePage={analyzeCurrentPage}
                scrollRequest={scrollRequest}
                disabled={loading}
              />
            )}

            {/* 텍스트 뷰: IntersectionObserver로 현재 페이지 추적 */}
            {viewMode === "text" && docPages.length > 0 && (
              <div ref={textContainerRef} className="h-full overflow-y-auto divide-y divide-slate-100">
                {docPages.map((pageText, index) => (
                  <div
                    key={index}
                    ref={(el) => { pageRefs.current[index] = el; }}
                    className="p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400">페이지 {index + 1}</span>
                      <button
                        onClick={() => analyzeCurrentPage(index)}
                        disabled={loading}
                        className="text-2xs font-semibold text-indigo-500 transition-colors hover:text-indigo-700 disabled:opacity-40"
                      >
                        AI 분석
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap wrap-break-word font-sans text-xs leading-5 text-slate-700">{pageText}</pre>
                  </div>
                ))}
              </div>
            )}

            {/* 페이지별 AI 분석 플로팅 위젯 */}
            {isReady && docPages.length > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                <button
                  onClick={() => scrollToPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-base text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="min-w-14 text-center text-xs font-semibold text-slate-700">
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  onClick={() => scrollToPage(Math.min(pageCount - 1, currentPage + 1))}
                  disabled={currentPage >= pageCount - 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-base text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30"
                >
                  ›
                </button>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <button
                  onClick={() => analyzeCurrentPage()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  이 페이지 분석
                </button>
              </div>
            )}

            {/* 파일 미업로드 플레이스홀더 */}
            {!pdfViewerFile && !docPages.length && (
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
