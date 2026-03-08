"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSessionSummary, requestSessionSummary, streamSessionSummary } from "@/lib/api/sessions";
import { useSummaryProgress } from "@/contexts/SummaryProgressContext";
import { ModelDefinition } from "@/types";

interface Props {
  sessionId: string;
  topic: string;
  localModels: ModelDefinition[];
  allDone: boolean;
}

type Status = "idle" | "loading" | "streaming" | "done" | "error" | "cancelled";

export function SummarySection({ sessionId, topic, localModels, allDone }: Props) {
  const [summary, setSummary] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [expanded, setExpanded] = useState(true);
  const [selectedModel, setSelectedModel] = useState(() => localModels[0]?.id ?? "");
  const abortRef = useRef<AbortController | null>(null);

  // localModels가 나중에 로드될 경우 selectedModel 초기화
  useEffect(() => {
    if (selectedModel === "" && localModels.length > 0) {
      setSelectedModel(localModels[0].id);
    }
  }, [localModels, selectedModel]);

  // 마운트 시 기존 저장된 서머리 로드 (BE 호출 없이 표시)
  useEffect(() => {
    getSessionSummary(sessionId).then(({ summary: saved }) => {
      if (saved) { setSummary(saved); setStatus("done"); }
    }).catch(() => {});
  }, [sessionId]);

  const { register, update, dismiss } = useSummaryProgress();

  const startSummary = useCallback(async (modelId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("streaming");
    setSummary("");
    register(sessionId, topic);

    let accumulated = "";
    let rafId: number | null = null;
    const flush = () => { setSummary(accumulated); rafId = null; };

    try {
      await requestSessionSummary(sessionId, modelId);
      await streamSessionSummary(sessionId, (chunk) => {
        accumulated += chunk;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      }, controller.signal);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      setSummary(accumulated);
      setStatus("done");
      update(sessionId, "done");
    } catch (e: unknown) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (e instanceof Error && e.name === "AbortError") {
        setStatus("cancelled");
        dismiss(sessionId);
        return;
      }
      setErrorMessage(e instanceof Error ? e.message : "");
      setStatus("error");
      update(sessionId, "error");
    } finally {
      abortRef.current = null;
    }
  }, [sessionId, topic, register, update, dismiss]);

  const handleCancel = () => abortRef.current?.abort();

  const handleGenerate = () => {
    if (status === "done" || status === "streaming" || !selectedModel) return;
    startSummary(selectedModel);
  };

  const handleRetry = () => {
    startSummary(selectedModel);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-3">
      <div className="w-full flex items-center justify-between px-5 py-3.5 gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 shrink-0 text-left"
        >
          <span className="text-sm font-semibold text-slate-700">AI 서머리</span>
          {status === "streaming" && (
            <span className="text-[11px] text-indigo-500 font-medium animate-pulse">생성 중...</span>
          )}
          {status === "loading" && (
            <span className="text-[11px] text-slate-400 animate-pulse">불러오는 중...</span>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {/* 모델 선택 */}
          {localModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={status === "streaming"}
              className="text-sm text-slate-500 bg-transparent focus:outline-none cursor-pointer max-w-36 truncate disabled:opacity-50 disabled:cursor-not-allowed mr-1"
            >
              {localModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          {status === "idle" && (
            <button
              onClick={handleGenerate}
              disabled={!selectedModel}
              className="text-xs font-semibold text-slate-400 hover:text-indigo-500 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="서머리 생성"
            >
              생성
            </button>
          )}
          {status === "streaming" && (
            <button
              onClick={handleCancel}
              className="text-xs font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              title="중단"
            >
              ✕
            </button>
          )}
          {(status === "error" || status === "cancelled") && (
            <button
              onClick={handleRetry}
              className="text-xs font-semibold text-slate-400 hover:text-indigo-500 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
              title="재시도"
            >
              ↺
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-400 text-sm px-1"
          >
            <span className={`inline-block transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}>▾</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {status === "error" ? (
            <div className="flex flex-col gap-1 pt-4">
              <p className="text-sm text-red-500">서머리 생성 중 오류가 발생했습니다.</p>
              {errorMessage && <p className="text-xs text-red-400 font-mono">{errorMessage}</p>}
            </div>
          ) : status === "cancelled" ? (
            <div className="flex items-center gap-2 pt-4">
              <p className="text-sm text-slate-400">서머리 생성이 중단되었습니다.</p>
            </div>
          ) : localModels.length === 0 ? (
            <div className="pt-4">
              <p className="text-sm text-slate-400">로컬 LLM 모델이 없어 서머리를 생성할 수 없습니다.</p>
            </div>
          ) : summary || status === "streaming" ? (
            <div className="prose prose-sm prose-slate max-w-none pt-4">
              {summary ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
              ) : null}
              {status === "streaming" && (
                <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          ) : (
            <div className="pt-4">
              <p className="text-sm text-slate-400">
                {allDone ? "서머리 생성 중..." : "리서치가 완료되면 AI 서머리가 자동으로 생성됩니다."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
