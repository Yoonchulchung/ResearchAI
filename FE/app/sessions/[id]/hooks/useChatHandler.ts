import { useEffect, useState, useCallback, useRef } from "react";
import { getChatHistory, clearChatHistory, chatStream } from "@/lib/api";
import { Session, ChatMessage } from "@/types";

export function useChatHandler(session: Session | null, id: string) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // 스크롤 컨테이너를 한 번 탐색 후 캐시
  const getScrollContainer = useCallback((): HTMLElement | null => {
    if (scrollContainerRef.current) return scrollContainerRef.current;
    let el: HTMLElement | null = chatBottomRef.current?.parentElement ?? null;
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

  // id 변경 시 초기화 및 히스토리 로드 후 하단 스크롤
  useEffect(() => {
    scrollContainerRef.current = null; // 컨테이너 캐시 초기화
    setChatMessages([]);
    getChatHistory(id).then((msgs) => {
      setChatMessages(msgs);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    }).catch(() => {});
  }, [id]);

  // 새 메시지 추가 시 하단으로 스크롤
  // — 스크롤 이벤트 대신 scrollTop을 직접 읽어 현재 위치를 정확히 판단
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distFromBottom < 3) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, getScrollContainer]);

  const handleChatSend = useCallback(async (message: string, model: string) => {
    if (!session || chatLoading) return;
    setChatLoading(true);
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);

    // 청크를 누적했다가 rAF 단위(~16ms)로 한 번만 setState
    let accumulated = "";
    let rafId: number | null = null;
    const flush = () => {
      const text = accumulated;
      setChatMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: text };
        }
        return updated;
      });
      rafId = null;
    };

    const controller = new AbortController();
    abortRef.current = controller;

    const handleStatus = (status: string) => {
      setChatMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !accumulated) {
          updated[updated.length - 1] = { ...last, content: `_${status}_` };
        }
        return updated;
      });
    };

    try {
      await chatStream(id, message, model || session.researchCloudAIModel, (chunk) => {
        accumulated += chunk;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      }, controller.signal, handleStatus);
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
    } catch (e) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if ((e as Error)?.name !== "AbortError") {
        setChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            updated[updated.length - 1] = { ...last, content: "오류가 발생했습니다. 다시 시도해 주세요." };
          }
          return updated;
        });
      }
    } finally {
      abortRef.current = null;
      setChatLoading(false);
    }
  }, [session, chatLoading, id]);

  const handleChatAbort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClearChat = useCallback(async () => {
    await clearChatHistory(id);
    setChatMessages([]);
  }, [id]);

  return { chatMessages, chatLoading, chatBottomRef, handleChatSend, handleClearChat, handleChatAbort };
}
