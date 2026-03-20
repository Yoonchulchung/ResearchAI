"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdown";
import { getSessionSummary, requestSessionSummary, streamSessionSummary } from "@/lib/api/sessions";
import { useSummaryProgress } from "@/contexts/SummaryProgressContext";
import { ModelDefinition } from "@/types";

interface Props {
  sessionId: string;
  topic: string;
  localAiModels: ModelDefinition[];
  allDone: boolean;
  summaryState?: string | null;
}

type SummaryStatus = "idle" | "pending" | "running" | "done" | "error" | "stopped" | "changed";

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}

export function SummarySection({ sessionId, topic, localAiModels, allDone, summaryState }: Props) {
  const [summary, setSummary] = useState<string>("");
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [expanded, setExpanded] = useState(true);
  const [selectedModel, setSelectedModel] = useState(() => localAiModels[0]?.id ?? "");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (selectedModel === "" && localAiModels.length > 0) {
      setSelectedModel(localAiModels[0].id);
    }
  }, [localAiModels, selectedModel]);

  useEffect(() => {
    if (summaryStatus === "running") return;
    getSessionSummary(sessionId).then(({ summary: saved }) => {
      if (saved) setSummary(saved);
      if (summaryState) setSummaryStatus(summaryState as SummaryStatus);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, summaryState]);

  useEffect(() => {
    if (summaryState !== "pending" && summaryState !== "running") return;

    const controller = new AbortController();
    abortRef.current = controller;
    setSummaryStatus("running");
    setSummary("");

    let accumulated = "";
    let rafId: number | null = null;
    const flush = () => { setSummary(accumulated); rafId = null; };

    streamSessionSummary(sessionId, (chunk) => {
      accumulated += chunk;
      if (rafId === null) rafId = requestAnimationFrame(flush);
    }, controller.signal)
      .then(() => {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        setSummary(accumulated);
        setSummaryStatus("done");
      })
      .catch((e: unknown) => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (e instanceof Error && e.name === "AbortError") {
          setSummaryStatus("stopped");
          return;
        }
        setErrorMessage(e instanceof Error ? e.message : "");
        setSummaryStatus("error");
      })
      .finally(() => { abortRef.current = null; });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { register, update, dismiss } = useSummaryProgress();

  const startSummary = useCallback(async (modelId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSummaryStatus("running");
    setSummary("");
    register(sessionId, topic);

    let accumulated = "";
    let rafId: number | null = null;
    const flush = () => { setSummary(accumulated); rafId = null; };

    try {
      const modelName = modelId.startsWith('ollama:')
        ? modelId.split(':').slice(1).join(':')
        : modelId;

      await requestSessionSummary(sessionId, modelName);
      await streamSessionSummary(sessionId, (chunk) => {
        accumulated += chunk;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      }, controller.signal);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      setSummary(accumulated);
      setSummaryStatus("done");
      update(sessionId, "done");
    } catch (e: unknown) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (e instanceof Error && e.name === "AbortError") {
        setSummaryStatus("stopped");
        dismiss(sessionId);
        return;
      }
      setErrorMessage(e instanceof Error ? e.message : "");
      setSummaryStatus("error");
      update(sessionId, "error");
    } finally {
      abortRef.current = null;
    }
  }, [sessionId, topic, register, update, dismiss]);

  const handleCancel = () => abortRef.current?.abort();

  const handleGenerate = () => {
    if (summaryStatus === "done" || summaryStatus === "running" || !selectedModel) return;
    startSummary(selectedModel);
  };

  const handleRetry = () => {
    startSummary(selectedModel);
  };

  return (
    <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm overflow-hidden mb-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <span className={`text-indigo-500 ${summaryStatus === "running" ? "animate-pulse" : ""}`}>
            <SparkleIcon />
          </span>
          <span className="text-sm font-semibold text-slate-800">AI 서머리</span>
          {summaryStatus === "running" && (
            <span className="text-xs text-indigo-500 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              생성 중
            </span>
          )}
          {summaryStatus === "done" && (
            <span className="text-xs text-emerald-500 font-medium">완료</span>
          )}
          {summaryStatus === "pending" && (
            <span className="text-xs text-slate-400 animate-pulse">불러오는 중...</span>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {localAiModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={summaryStatus === "running"}
              className="text-xs text-slate-500 bg-transparent focus:outline-none cursor-pointer max-w-36 truncate disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {localAiModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          {(summaryStatus === "idle" || summaryStatus === "changed") && (
            <button
              onClick={handleGenerate}
              disabled={!selectedModel}
              className="text-xs font-semibold text-slate-400 hover:text-indigo-600 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              생성
            </button>
          )}
          {summaryStatus === "running" && (
            <button
              onClick={handleCancel}
              className="text-xs font-semibold text-slate-400 hover:text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              중단
            </button>
          )}
          {(summaryStatus === "error" || summaryStatus === "stopped") && (
            <button
              onClick={handleRetry}
              className="text-xs font-semibold text-slate-400 hover:text-indigo-600 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
              title="재시도"
            >
              ↺ 재시도
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-300 hover:text-slate-500 transition-colors p-0.5"
          >
            <span className={`inline-block transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="border-t border-slate-100">
          {summaryStatus === "error" ? (
            <div className="flex flex-col gap-1.5 px-5 py-4">
              <p className="text-sm text-red-500 font-medium">서머리 생성 중 오류가 발생했습니다.</p>
              {errorMessage && <p className="text-xs text-red-400 font-mono bg-red-50 px-3 py-2 rounded-lg">{errorMessage}</p>}
            </div>
          ) : summaryStatus === "stopped" ? (
            <div className="px-5 py-4">
              <p className="text-sm text-slate-400">서머리 생성이 중단되었습니다.</p>
            </div>
          ) : summary || summaryStatus === "running" ? (
            <div className="px-5 py-4 prose prose-sm prose-slate max-w-none
              [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-slate-800
              [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-slate-800
              [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-slate-700
              [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-slate-700
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
              [&_li]:my-0.5 [&_li]:text-slate-700
              [&_strong]:font-semibold [&_strong]:text-slate-800
              [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs
              [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic">
              {summary ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{summary}</ReactMarkdown>
              ) : null}
              {summaryStatus === "running" && (
                <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          ) : localAiModels.length === 0 ? (
            <div className="px-5 py-4">
              <p className="text-sm text-slate-400">로컬 LLM 모델이 없어 서머리를 생성할 수 없습니다.</p>
            </div>
          ) : (
            <div className="px-5 py-4">
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
