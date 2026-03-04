"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Task, TaskStatus, SearchSources } from "../../types";

export type Phase = "searching" | "analyzing";

export const SOURCE_LABELS: { key: keyof SearchSources; label: string }[] = [
  { key: "tavily", label: "Tavily" },
  { key: "serper", label: "Serper" },
  { key: "naver", label: "네이버" },
  { key: "brave", label: "Brave" },
  { key: "ollama", label: "Ollama 압축" },
];

export function TaskCard({
  task,
  status,
  phase,
  result,
  sources,
  onRun,
  onCancel,
}: {
  task: Task;
  status: TaskStatus;
  phase?: Phase;
  result?: string;
  sources?: SearchSources;
  onRun: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"result" | keyof SearchSources>("result");

  const availableSources = SOURCE_LABELS.filter((s) => sources?.[s.key]);
  const hasContent = !!result || availableSources.length > 0;

  // 소스가 새로 생기면 자동 펼침 (검색/분석 단계 모두)
  useEffect(() => {
    if (availableSources.length > 0 && status === "loading") {
      setExpanded(true);
      if (activeTab === "result" && !result) {
        setActiveTab(availableSources[0].key);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSources.length]);

  // 분석 완료 시 AI 결과 탭으로 이동
  useEffect(() => {
    if (status === "done" && result) {
      setActiveTab("result");
    }
  }, [status, result]);

  const borderColorMap: Record<string, string> = {
    done: "#22c55e",
    loading: "#6366f1",
    queued: "#f59e0b",
    error: "#ef4444",
    idle: "#e2e8f0",
  };
  const borderColor = borderColorMap[status] ?? "#e2e8f0";

  const badgeStyleMap: Record<string, string> = {
    done: "bg-green-100 text-green-700",
    loading: "bg-indigo-100 text-indigo-700",
    queued: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
    idle: "bg-slate-100 text-slate-500",
  };
  const badgeStyle = badgeStyleMap[status] ?? "bg-slate-100 text-slate-500";

  const badgeLabelMap: Record<string, string> = {
    done: "완료",
    loading: phase === "searching" ? "검색 중" : "분석 중",
    queued: "대기 중",
    error: "오류",
    idle: "대기",
  };
  const badgeLabel = badgeLabelMap[status] ?? "대기";

  const subText =
    status === "idle"
      ? "클릭하여 분석 시작"
      : status === "queued"
      ? "⏳ 큐 대기 중..."
      : status === "loading" && phase === "searching"
      ? `🔍 웹 검색 중...${availableSources.length > 0 ? ` · ${availableSources.length}개 완료` : ""}`
      : status === "loading" && phase === "analyzing"
      ? `🤖 AI 분석 중...${hasContent ? " · 클릭하여 검색 결과 보기" : ""}`
      : status === "done"
      ? "✅ 완료 · 클릭하여 결과 보기"
      : "❌ 오류 발생";

  const handleCardClick = () => {
    if (status === "idle") onRun();
    else if (hasContent) setExpanded((e) => !e);
  };

  return (
    <div
      style={{ borderColor }}
      className="border-2 rounded-2xl bg-white shadow-sm overflow-hidden transition-colors"
    >
      <div
        onClick={handleCardClick}
        style={{
          background: status === "loading" ? "#f0f0ff" : "#fff",
          cursor: status === "idle" || hasContent ? "pointer" : "default",
        }}
        className="flex items-center gap-3 px-5 py-4"
      >
        <span className="text-2xl shrink-0">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm">
            {task.id}. {task.title}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{subText}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {availableSources.length > 0 && (
            <span className="text-xs text-slate-400 font-medium">
              검색 {availableSources.length}개
            </span>
          )}
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeStyle}`}>
            {badgeLabel}
          </span>
          {status === "loading" && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-xs font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              title="중단"
            >
              ✕
            </button>
          )}
          {status === "error" && (
            <button
              onClick={(e) => { e.stopPropagation(); onRun(); }}
              className="text-xs font-semibold text-slate-400 hover:text-indigo-500 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
              title="재시도"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      {expanded && hasContent && (
        <div className="border-t border-slate-100">
          {/* 탭 바 */}
          <div className="flex gap-1 px-4 pt-3 pb-0 bg-slate-50 overflow-x-auto">
            <button
              onClick={() => setActiveTab("result")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "result"
                  ? "border-indigo-500 text-indigo-700 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              🤖 AI 결과
            </button>
            {availableSources.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === key
                    ? "border-indigo-500 text-indigo-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                🔍 {label}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          {activeTab === "result" ? (
            result ? (
              <div className="px-5 py-4 bg-slate-50 max-h-150 overflow-y-auto prose prose-sm prose-slate max-w-none
                [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                [&_th]:bg-slate-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
                [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
                [&_tr:nth-child(even)]:bg-white [&_tr:nth-child(odd)]:bg-slate-50/50
                [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-slate-800
                [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-slate-800
                [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-slate-700
                [&_strong]:font-bold [&_strong]:text-slate-800
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                [&_li]:my-0.5 [&_li]:text-slate-700
                [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-slate-700
                [&_code]:bg-slate-200 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700
                [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic
                [&_hr]:border-slate-200 [&_hr]:my-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
              </div>
            ) : (
              <div className="px-5 py-8 bg-slate-50 flex flex-col items-center gap-2 text-slate-400">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-xs">AI가 검색 결과를 분석하고 있습니다...</p>
              </div>
            )
          ) : (
            <div className="px-5 py-4 bg-slate-50 max-h-150 overflow-y-auto">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">
                {sources?.[activeTab as keyof SearchSources]}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
