"use client";

import { useEffect, useRef, useState } from "react";
import { getSessionSummary, streamSessionSummary } from "@/lib/api";

interface Props {
  sessionId: string;
  localModel: string;
  allDone: boolean;
}

type Status = "idle" | "loading" | "streaming" | "done" | "error" | "no-model";

export function SummarySection({ sessionId, localModel, allDone }: Props) {
  const [summary, setSummary] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [expanded, setExpanded] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const triggeredRef = useRef(false);

  // 기존 서머리 로드
  useEffect(() => {
    getSessionSummary(sessionId)
      .then(({ summary: s }) => {
        if (s) {
          setSummary(s);
          setStatus("done");
          triggeredRef.current = true;
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // allDone이 되면 자동 생성 (로컬 모델 필요, 아직 생성 안 된 경우만)
  useEffect(() => {
    if (!allDone || triggeredRef.current) return;
    if (!localModel) {
      setStatus("no-model");
      return;
    }

    triggeredRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("streaming");
    setSummary("");

    let accumulated = "";
    let rafId: number | null = null;
    const flush = () => {
      setSummary(accumulated);
      rafId = null;
    };

    streamSessionSummary(sessionId, localModel, (chunk) => {
      accumulated += chunk;
      if (rafId === null) rafId = requestAnimationFrame(flush);
    }, controller.signal)
      .then(() => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        setSummary(accumulated);
        setStatus("done");
      })
      .catch((e: unknown) => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (e instanceof Error && e.name === "AbortError") return;
        setStatus("error");
      })
      .finally(() => {
        abortRef.current = null;
      });

    return () => {
      controller.abort();
    };
  }, [allDone, sessionId, localModel]);

  // 노출 조건: allDone이 아니면 숨김
  if (!allDone && status === "idle") return null;
  if (status === "no-model") return null;
  if (!summary && status === "idle") return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">AI 서머리</span>
          {status === "streaming" && (
            <span className="text-[11px] text-indigo-500 font-medium animate-pulse">생성 중...</span>
          )}
          {status === "done" && (
            <span className="text-[11px] text-slate-400 font-medium">{localModel}</span>
          )}
          {status === "loading" && (
            <span className="text-[11px] text-slate-400 animate-pulse">불러오는 중...</span>
          )}
        </div>
        <span className={`text-slate-400 text-sm transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}>
          ▾
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {status === "error" ? (
            <p className="text-sm text-red-500 pt-4">서머리 생성 중 오류가 발생했습니다.</p>
          ) : summary ? (
            <div className="prose prose-sm prose-slate max-w-none pt-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {summary}
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-4">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-400">로컬 LLM으로 서머리를 생성하고 있습니다...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
