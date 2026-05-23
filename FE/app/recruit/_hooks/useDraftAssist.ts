"use client";

import { useState } from "react";
import { enqueueRecruitAssist } from "@/lib/api/recruit/assist";
import { streamWriteAssist } from "@/lib/api/ai";
import { MODELS } from "../_constants";

export type AssistMode = "spellcheck" | "evaluate";

export function useDraftAssist() {
  const [draft, setDraft] = useState("");
  const [assistMode, setAssistMode] = useState<AssistMode | null>(null);
  const [assistResult, setAssistResult] = useState("");
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);

  const runDraftAssist = async (mode: AssistMode) => {
    setAssistMode(mode);
    setAssistResult("");
    setAssistError(null);

    if (!draft.trim()) {
      setAssistError("검사할 자소서 내용을 먼저 입력해주세요.");
      return;
    }

    setAssistLoading(true);
    try {
      const { jobId } = await enqueueRecruitAssist(mode, draft, MODELS[0].id);
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") {
          setAssistResult((prev) => prev + event.text);
        } else if (event.type === "error") {
          setAssistError(event.message || "AI 검사 중 오류가 발생했습니다.");
        }
      });
    } catch (e) {
      setAssistError(e instanceof Error ? e.message : "AI 검사 중 오류가 발생했습니다.");
    } finally {
      setAssistLoading(false);
    }
  };

  const closeAssist = () => setAssistMode(null);

  return {
    draft,
    setDraft,
    assistMode,
    assistResult,
    assistLoading,
    assistError,
    runDraftAssist,
    closeAssist,
  };
}
