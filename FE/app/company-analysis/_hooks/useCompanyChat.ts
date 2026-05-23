"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanyAnalysis } from "@/lib/api/company-analysis";
import { API_BASE, readSSE, tokenStore } from "@/lib/api/base";
import { DEFAULT_FREE_MODEL_ID } from "@/sessions/new/hooks/useNewSession";

interface CloudModel { id: string; name: string }

interface UseCompanyChatProps {
  selected: CompanyAnalysis | null;
  cloudAiModels: CloudModel[];
  localAiModels: CloudModel[];
}

export function useCompanyChat({ selected, cloudAiModels, localAiModels }: UseCompanyChatProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [isChatBtnVisible, setIsChatBtnVisible] = useState(true);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatModel, setChatModel] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const chatBtnRef = useRef<HTMLButtonElement>(null);
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 모델 초기값: Haiku 우선
  const haikuModelId = cloudAiModels.find((m) => m.id.toLowerCase().includes("haiku"))?.id
    ?? cloudAiModels.at(-1)?.id
    ?? "";
  useEffect(() => {
    if (chatModel || !haikuModelId) return;
    setChatModel(haikuModelId);
  }, [haikuModelId]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!chatOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (chatPanelRef.current?.contains(target)) return;
      if (chatBtnRef.current?.contains(target)) return;
      setChatOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [chatOpen]);

  // 기업 변경 시 대화 초기화
  useEffect(() => { setChatMessages([]); }, [selected?.companyKey]);

  // 새 메시지 → 스크롤 하단
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // 열릴 때 포커스
  useEffect(() => {
    if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [chatOpen]);

  const handleDetailScroll = useCallback(() => {
    setIsChatBtnVisible(false);
    if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current);
    scrollHideTimerRef.current = setTimeout(() => setIsChatBtnVisible(true), 800);
  }, []);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");

    const nextMessages = [...chatMessages, { role: "user" as const, content: userMsg }];
    setChatMessages(nextMessages);
    setChatLoading(true);

    const systemPrompt = selected
      ? `당신은 ${selected.companyName} 기업 분석 AI 어시스턴트입니다. 제공된 기업 분석 산출물과 작성 근거를 바탕으로 질문에 명확하고 간결하게 한국어로 답변하세요. 이모지는 사용하지 마세요.`
      : "당신은 기업 분석 AI 어시스턴트입니다. 한국어로 답변하세요. 이모지는 사용하지 마세요.";

    let assistantContent = "";
    setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const token = tokenStore.get();
      const res = await fetch(`${API_BASE}/chat/direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMsg,
          model: chatModel === DEFAULT_FREE_MODEL_ID ? "" : chatModel || "",
          systemPrompt,
          companyAnalysisKey: selected?.companyKey,
          history: chatMessages.slice(-20),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`채팅 API 오류 (${res.status})`);

      await readSSE<{ type: string; text?: string; message?: string }>(res, (ev) => {
        if (ev.type === "chunk" && ev.text) {
          assistantContent += ev.text;
          setChatMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: assistantContent }]);
        }
        if (ev.type === "done" || ev.type === "error") return true;
      });
    } catch (e) {
      setChatMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, chatModel, selected]);

  return {
    chatOpen, setChatOpen,
    isChatBtnVisible,
    chatMessages, setChatMessages,
    chatInput, setChatInput,
    chatLoading,
    chatModel, setChatModel,
    chatEndRef, chatInputRef, chatPanelRef, chatBtnRef,
    handleDetailScroll,
    sendChatMessage,
    cloudAiModels,
    localAiModels,
  };
}
