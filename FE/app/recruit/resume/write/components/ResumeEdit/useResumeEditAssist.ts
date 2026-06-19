"use client";

import { useState, type ClipboardEvent } from "react";
import type { ResumeTarget } from "@/lib/api/resume";
import { streamWriteAssist } from "@/lib/api/ai";
import { enqueueRecruitAssist } from "@/lib/api/recruit/assist";
import { MODELS } from "../../../../_constants";
import {
  applySpellcheckChanges,
  buildSpellcheckChanges,
  extractCorrectedSpellcheckText,
  extractJdTextFromImage,
  type SpellcheckChangeStatus,
  type SpellcheckState,
} from "./support";

export function useResumeEditAssist({
  activeTarget,
  updateActiveTarget,
  model,
}: {
  activeTarget: ResumeTarget;
  updateActiveTarget: (patch: Partial<ResumeTarget>) => void;
  model?: string;
}) {
  const [jdDragOver, setJdDragOver] = useState(false);
  const [jdImageLoading, setJdImageLoading] = useState(false);
  const [jdImageError, setJdImageError] = useState<string | null>(null);
  const [jdOcrModel, setJdOcrModel] = useState(MODELS[0].id);
  const [spellchecks, setSpellchecks] = useState<
    Record<string, SpellcheckState>
  >({});

  const runSpellcheck = async (fieldKey: string, text: string) => {
    const baseText = text;
    if (!baseText.trim() || spellchecks[fieldKey]?.loading) return;

    setSpellchecks((prev) => ({
      ...prev,
      [fieldKey]: {
        loading: true,
        baseText,
        correctedText: "",
        rawResult: "",
        changes: [],
        error: null,
      },
    }));

    let fullResult = "";
    try {
      const { jobId } = await enqueueRecruitAssist(
        "spellcheck",
        baseText,
        model || MODELS[0].id,
      );
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") {
          fullResult += event.text;
          setSpellchecks((prev) => {
            const current = prev[fieldKey];
            if (!current) return prev;
            return {
              ...prev,
              [fieldKey]: { ...current, rawResult: fullResult },
            };
          });
        } else if (event.type === "error") {
          setSpellchecks((prev) => {
            const current = prev[fieldKey];
            if (!current) return prev;
            return {
              ...prev,
              [fieldKey]: {
                ...current,
                loading: false,
                error: event.message || "맞춤법 검사 중 오류가 발생했습니다.",
              },
            };
          });
        }
      });

      const correctedText = extractCorrectedSpellcheckText(
        fullResult,
        baseText,
      );
      const changes = buildSpellcheckChanges(baseText, correctedText);
      setSpellchecks((prev) => {
        const current = prev[fieldKey];
        if (!current) return prev;
        return {
          ...prev,
          [fieldKey]: {
            ...current,
            loading: false,
            correctedText,
            rawResult: fullResult,
            changes,
            error: null,
          },
        };
      });
    } catch (error) {
      setSpellchecks((prev) => {
        const current = prev[fieldKey];
        if (!current) return prev;
        return {
          ...prev,
          [fieldKey]: {
            ...current,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "맞춤법 검사 중 오류가 발생했습니다.",
          },
        };
      });
    }
  };

  const updateSpellcheckChange = (
    fieldKey: string,
    changeId: string,
    status: SpellcheckChangeStatus,
    onChange: (value: string) => void,
  ) => {
    const current = spellchecks[fieldKey];
    if (!current) return;
    const changes = current.changes.map((change) =>
      change.id === changeId ? { ...change, status } : change,
    );
    if (status === "accepted") {
      onChange(applySpellcheckChanges(current.baseText, changes));
    }
    setSpellchecks((prev) => {
      const latest = prev[fieldKey];
      if (!latest) return prev;
      return { ...prev, [fieldKey]: { ...latest, changes } };
    });
  };

  const applyAllSpellcheckChanges = (
    fieldKey: string,
    onChange: (value: string) => void,
  ) => {
    const current = spellchecks[fieldKey];
    if (!current) return;
    const changes = current.changes.map((change) =>
      change.status === "pending"
        ? { ...change, status: "accepted" as const }
        : change,
    );
    onChange(applySpellcheckChanges(current.baseText, changes));
    setSpellchecks((prev) => {
      const latest = prev[fieldKey];
      if (!latest) return prev;
      return { ...prev, [fieldKey]: { ...latest, changes } };
    });
  };

  const closeSpellcheck = (fieldKey: string) => {
    setSpellchecks((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  };

  const handleJdImageFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length === 0 || jdImageLoading) return;

    setJdImageLoading(true);
    setJdImageError(null);
    try {
      const texts = (
        await Promise.all(
          imageFiles.map((file) => extractJdTextFromImage(file, jdOcrModel)),
        )
      ).filter(Boolean);
      if (texts.length === 0) {
        setJdImageError("이미지에서 추출된 텍스트가 없습니다.");
        return;
      }
      updateActiveTarget({
        jd: [activeTarget.jd.trim(), ...texts].filter(Boolean).join("\n\n"),
      });
    } catch (error) {
      setJdImageError(
        error instanceof Error
          ? error.message
          : "이미지 텍스트 추출에 실패했습니다.",
      );
    } finally {
      setJdImageLoading(false);
      setJdDragOver(false);
    }
  };

  const handleJdPaste = (
    event: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  ) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }

    if (files.length > 0) {
      event.preventDefault();
      void handleJdImageFiles(files);
    }
  };

  return {
    spellchecks,
    runSpellcheck,
    updateSpellcheckChange,
    applyAllSpellcheckChanges,
    closeSpellcheck,
    jdDragOver,
    setJdDragOver,
    jdImageLoading,
    jdImageError,
    jdOcrModel,
    setJdOcrModel,
    handleJdImageFiles,
    handleJdPaste,
  };
}

export type ResumeEditAssist = ReturnType<typeof useResumeEditAssist>;
