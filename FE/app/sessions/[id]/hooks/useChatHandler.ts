import { useEffect, useState, useCallback, useRef } from "react";
import { getChatHistory, clearChatHistory, chatStream } from "@/lib/api";
import { Session, ChatMessage } from "@/types";

export function useChatHandler(session: Session | null, id: string) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // id 변경 시 초기화 및 히스토리 로드
  useEffect(() => {
    setChatMessages([]);
    getChatHistory(id).then(setChatMessages).catch(() => {});
  }, [id]);

  // 새 메시지 추가 시 하단으로 스크롤
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

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

    try {
      await chatStream(id, message, model || session.model, (chunk) => {
        accumulated += chunk;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      });
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
    } catch {
      if (rafId !== null) cancelAnimationFrame(rafId);
      setChatMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = { ...last, content: "오류가 발생했습니다. 다시 시도해 주세요." };
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  }, [session, chatLoading, id]);

  const handleClearChat = useCallback(async () => {
    await clearChatHistory(id);
    setChatMessages([]);
  }, [id]);

  return { chatMessages, chatLoading, chatBottomRef, handleChatSend, handleClearChat };
}
