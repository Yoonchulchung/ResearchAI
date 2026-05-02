import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { enqueueWriteAssist, streamWriteAssist } from "@/lib/api/ai";
import { enqueueDocWriteAssist } from "@/lib/api/doc-write";
import type { ExperienceSearchResult } from "@/lib/api/experiences";
import { MODELS } from "../_constants";
import type { ChatMessage } from "../_types";

function chatKey(docId: string | null) {
  return `doc-write-chat:${docId ?? "new"}`;
}

function pendingJobKey(docId: string | null) {
  return `doc-write-pending:${docId ?? "new"}`;
}

export function useAiAssist(setContent: Dispatch<SetStateAction<string>>) {
  const searchParams = useSearchParams();
  const docId = searchParams.get("docId");

  const [model, setModel] = useState(MODELS[0].id);
  const [customPrompt, setCustomPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 스크롤 컨테이너 탐색 후 캐시
  const getScrollContainer = useCallback((): HTMLElement | null => {
    if (scrollContainerRef.current) return scrollContainerRef.current;
    let el: HTMLElement | null = messagesEndRef.current?.parentElement ?? null;
    while (el) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === "auto" || overflowY === "scroll") {
        scrollContainerRef.current = el;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  // 새 메시지 시 하단 근처일 때만 스크롤
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distFromBottom < 80) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, getScrollContainer]);

  // SSE 스트림 — chunks를 msgId에 해당하는 메시지에 누적
  const streamIntoMessage = useCallback(async (
    jobId: string,
    msgId: string,
    currentDocId: string | null,
    resetContent: boolean,
    signal?: AbortSignal,
  ) => {
    if (resetContent) {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: "" } : m));
    }
    try {
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") {
          setMessages((prev) => prev.map((m) =>
            m.id === msgId ? { ...m, content: m.content + event.text } : m,
          ));
        } else if (event.type === "error") {
          setAiError((event as any).message ?? "오류가 발생했습니다");
        }
      }, signal);
    } finally {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, streaming: false } : m));
      try { localStorage.removeItem(pendingJobKey(currentDocId)); } catch { /* 무시 */ }
      setAiLoading(false);
    }
  }, []);

  // docId 변경 시 해당 채팅 히스토리 로드 + pending job 재연결
  useEffect(() => {
    abortRef.current?.abort();
    try {
      const saved = localStorage.getItem(chatKey(docId));
      const restored: ChatMessage[] = saved
        ? JSON.parse(saved).map((m: ChatMessage) => ({ ...m, streaming: false }))
        : [];
      setMessages(restored);

      const pendingRaw = localStorage.getItem(pendingJobKey(docId));
      if (pendingRaw) {
        const { jobId, msgId } = JSON.parse(pendingRaw) as { jobId: string; msgId: string };
        const msgExists = restored.some((m) => m.id === msgId);
        setAiLoading(true);
        if (msgExists) {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, streaming: true } : m));
        } else {
          setMessages((prev) => [...prev, { id: msgId, role: "assistant", content: "", streaming: true }]);
        }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        streamIntoMessage(jobId, msgId, docId, msgExists, ctrl.signal).catch(() => {
          setMessages((prev) => prev.map((m) =>
            m.id === msgId
              ? { ...m, content: m.content || "연결이 끊겼습니다. 다시 시도해주세요.", streaming: false }
              : m,
          ));
          setAiLoading(false);
        });
      }
    } catch {
      setMessages([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // messages 변경 시 localStorage 저장
  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(chatKey(docId));
    } else {
      localStorage.setItem(chatKey(docId), JSON.stringify(messages));
    }
  }, [messages, docId]);

  const runAssist = async (
    instruction: string,
    content: string,
    selectedText: string,
    selectedExperiences: ExperienceSearchResult[],
    userLabel?: string,
    actionKey?: string,
  ) => {
    if (aiLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: userLabel ?? instruction };
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: ChatMessage = { id: assistantMsgId, role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setAiLoading(true);
    setAiError(null);

    const targetContent = selectedText || content;
    const currentHistory = messages.map((m) => ({ role: m.role, content: m.content }));
    const currentDocId = docId;

    try {
      let jobId: string;
      if (actionKey) {
        const experiences = selectedExperiences.map((e) => ({ title: e.title, content: e.content }));
        ({ jobId } = await enqueueDocWriteAssist(actionKey, targetContent, model, experiences, instruction || undefined));
      } else {
        const expContext =
          selectedExperiences.length > 0
            ? `## 참고할 나의 경험\n${selectedExperiences.map((e) => `### ${e.title}\n${e.content}`).join("\n\n")}\n\n---\n\n`
            : "";
        ({ jobId } = await enqueueWriteAssist(targetContent, expContext + instruction, model, currentHistory));
      }

      try { localStorage.setItem(pendingJobKey(currentDocId), JSON.stringify({ jobId, msgId: assistantMsgId })); } catch { /* 무시 */ }

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      await streamIntoMessage(jobId, assistantMsgId, currentDocId, false, ctrl.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: m.content || "오류가 발생했습니다.", streaming: false }
            : m,
        ));
        setAiError(e instanceof Error ? e.message : "오류가 발생했습니다");
      }
      try { localStorage.removeItem(pendingJobKey(currentDocId)); } catch { /* 무시 */ }
      setAiLoading(false);
    } finally {
      setCustomPrompt("");
    }
  };

  const runImprove = async (
    selectedText: string,
    onResult: (improved: string) => void,
  ) => {
    if (aiLoading || !selectedText.trim()) return;
    setAiLoading(true);
    setAiError(null);
    let accumulated = "";
    try {
      const { jobId } = await enqueueWriteAssist(
        selectedText,
        "다음 글을 더 명확하고 자연스럽게 개선해줘. 내용을 바꾸지 말고 표현과 구조만 다듬어줘. 개선된 글만 출력해.",
        model,
      );
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") accumulated += event.text;
        else if (event.type === "error") setAiError((event as any).message ?? "오류가 발생했습니다");
      });
      if (accumulated) onResult(accumulated.trim());
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setAiLoading(false);
    }
  };

  const applyResult = (resultContent: string, applyMode: "append" | "replace") => {
    if (applyMode === "append") {
      setContent((prev) => (prev ? `${prev}\n\n${resultContent}` : resultContent));
    } else {
      setContent(resultContent);
    }
  };

  const copyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return {
    model,
    setModel,
    customPrompt,
    setCustomPrompt,
    messages,
    setMessages,
    aiLoading,
    aiError,
    copiedId,
    messagesEndRef,
    runAssist,
    runImprove,
    applyResult,
    copyText,
  };
}
