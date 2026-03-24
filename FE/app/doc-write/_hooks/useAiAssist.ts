import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { enqueueWriteAssist, streamWriteAssist } from "@/lib/api/ai";
import type { ExperienceSearchResult } from "@/lib/api/experiences";
import { MODELS } from "../_constants";
import type { ChatMessage } from "../_types";

function chatKey(docId: string | null) {
  return `doc-write-chat:${docId ?? "new"}`;
}

export function useAiAssist(setContent: Dispatch<SetStateAction<string>>) {
  const searchParams = useSearchParams();
  const docId = searchParams.get("docId");

  const [model, setModel] = useState(MODELS[0].id);
  const [customPrompt, setCustomPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // docId 변경 시 해당 채팅 히스토리 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem(chatKey(docId));
      setMessages(saved ? JSON.parse(saved) : []);
    } catch {
      setMessages([]);
    }
  }, [docId]);

  // messages 변경 시 localStorage 저장
  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(chatKey(docId));
    } else {
      localStorage.setItem(chatKey(docId), JSON.stringify(messages));
    }
  }, [messages, docId]);

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

  // 새 메시지/스트리밍 시 하단 근처일 때만 스크롤
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distFromBottom < 80) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingContent, getScrollContainer]);

  const runAssist = async (
    instruction: string,
    content: string,
    selectedText: string,
    selectedExperiences: ExperienceSearchResult[],
    userLabel?: string,
  ) => {
    if (aiLoading) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userLabel ?? instruction,
    };
    setMessages((prev) => [...prev, userMsg]);
    setAiLoading(true);
    setStreamingContent("");
    setAiError(null);

    let accumulated = "";
    const targetContent = selectedText || content;
    const expContext =
      selectedExperiences.length > 0
        ? `## 참고할 나의 경험\n${selectedExperiences.map((e) => `### ${e.title}\n${e.content}`).join("\n\n")}\n\n---\n\n`
        : "";
    const finalInstruction = expContext + instruction;

    try {
      const { jobId } = await enqueueWriteAssist(targetContent, finalInstruction, model);
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") {
          accumulated += event.text;
          setStreamingContent(accumulated);
        } else if (event.type === "error") {
          setAiError(event.message);
        }
      });
      if (accumulated) {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 1).toString(), role: "assistant", content: accumulated },
        ]);
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setAiLoading(false);
      setStreamingContent("");
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
        else if (event.type === "error") setAiError(event.message);
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
    streamingContent,
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
