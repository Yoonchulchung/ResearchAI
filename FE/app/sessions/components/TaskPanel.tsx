"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Task, WebModels } from "@/types";
import { markdownComponents } from "@/lib/markdown";

export type TaskPanelTab = "result" | "duckduckgo" | "detail";

interface Props {
  task: Task;
  aiResult?: string;
  webModel?: WebModels;
  initialTab?: TaskPanelTab;
  onClose: () => void;
}

const PROSE = `px-6 py-5 flex-1 overflow-y-auto prose prose-slate max-w-none font-sans text-sm
  [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
  [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
  [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
  [&_tr:nth-child(even)]:bg-white [&_tr:nth-child(odd)]:bg-slate-50/50
  [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-slate-800
  [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-slate-800
  [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-slate-700
  [&_strong]:font-bold [&_strong]:text-slate-800
  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
  [&_li]:my-0.5 [&_li]:text-slate-700
  [&_p]:my-2 [&_p]:leading-loose [&_p]:text-slate-700
  [&_code]:bg-slate-200 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700
  [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic
  [&_hr]:border-slate-200 [&_hr]:my-3`;

export function TaskPanel({ task, aiResult, webModel, initialTab = "result", onClose }: Props) {
  const [tab, setTab] = useState<TaskPanelTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, task.id]);

  const hasDuckDuckGo = !!webModel?.duckduckgo;

  const tabs: { key: TaskPanelTab; label: string }[] = [
    { key: "result", label: "AI 결과" },
    ...(hasDuckDuckGo ? [{ key: "duckduckgo" as TaskPanelTab, label: "DuckDuckGo" }] : []),
    { key: "detail", label: "상세" },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-white">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-200 flex items-start gap-3 shrink-0 bg-white">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-medium mb-0.5">태스크</p>
          <h3 className="text-sm font-bold text-slate-800 leading-snug">{task.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
          title="닫기"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-4 pt-2.5 pb-0 bg-slate-50/80 border-b border-slate-100 shrink-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-t-md border-b-2 transition-all whitespace-nowrap ${
              tab === key
                ? "border-indigo-500 text-indigo-700 bg-white shadow-sm"
                : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "result" && (
        aiResult ? (
          <div className={PROSE}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{aiResult}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 py-16">
            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-xs">AI 결과가 없습니다.</p>
          </div>
        )
      )}

      {tab === "duckduckgo" && (
        webModel?.duckduckgo ? (
          <div className={PROSE}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{webModel.duckduckgo}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-16">
            DuckDuckGo 결과가 없습니다.
          </div>
        )
      )}

      {tab === "detail" && (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* 신뢰도 */}
          {task.confidence != null && (
            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">신뢰도 평가</p>
              {task.confidence.reason.startsWith("신뢰도 평가 중 오류") ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-red-600">평가 실패</p>
                  <p className="text-xs text-red-500 leading-relaxed break-all mt-1">{task.confidence.reason}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          task.confidence.score >= 71 ? "bg-emerald-400"
                          : task.confidence.score >= 41 ? "bg-amber-400"
                          : "bg-red-400"
                        }`}
                        style={{ width: `${task.confidence.score}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${
                      task.confidence.score >= 71 ? "text-emerald-600"
                      : task.confidence.score >= 41 ? "text-amber-600"
                      : "text-red-600"
                    }`}>{task.confidence.score}%</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed bg-white rounded-lg border border-slate-100 px-3 py-2">
                    {task.confidence.reason}
                  </p>
                </>
              )}
            </section>
          )}

          {/* 토큰 사용량 */}
          {(task.inputTokens != null || task.outputTokens != null) && (
            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">토큰 사용량</p>
              <div className="bg-white rounded-lg border border-slate-100 divide-y divide-slate-100 text-xs">
                <div className="flex items-center px-3 py-2 gap-2">
                  <span className="text-slate-400 w-24 shrink-0">입력 토큰</span>
                  <span className="text-slate-700 font-medium tabular-nums">{task.inputTokens?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex items-center px-3 py-2 gap-2">
                  <span className="text-slate-400 w-24 shrink-0">출력 토큰</span>
                  <span className="text-slate-700 font-medium tabular-nums">{task.outputTokens?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex items-center px-3 py-2 gap-2">
                  <span className="text-slate-400 w-24 shrink-0">예상 비용</span>
                  <span className="text-slate-700 font-medium tabular-nums">
                    {task.estimatedFees != null ? `$${task.estimatedFees.toFixed(6)}` : "—"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* 검색 정보 */}
          <section>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">검색 정보</p>
            <div className="bg-white rounded-lg border border-slate-100 divide-y divide-slate-100 text-xs">
              <div className="flex items-center px-3 py-2 gap-2">
                <span className="text-slate-400 w-24 shrink-0">사용된 엔진</span>
                <span className="text-slate-700 font-medium">{task.usedWebModel ?? task.webModel ?? "—"}</span>
              </div>
              <div className="flex items-center px-3 py-2 gap-2">
                <span className="text-slate-400 w-24 shrink-0">연구 상태</span>
                <span className="text-slate-700 font-medium">{task.researchState ?? task.status ?? "—"}</span>
              </div>
              <div className="flex items-center px-3 py-2 gap-2">
                <span className="text-slate-400 w-24 shrink-0">항목 ID</span>
                <span className="text-slate-500 font-mono text-xs">{task.itemId || "—"}</span>
              </div>
            </div>
          </section>

          {/* 검색 프롬프트 */}
          <section>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">검색 프롬프트</p>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed bg-white rounded-lg border border-slate-100 px-3 py-2">
              {task.webSearchPrompt || "(없음)"}
            </pre>
          </section>

          {/* AI 검색 기록 */}
          {task.searchLog && task.searchLog.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                AI 검색 기록 <span className="normal-case font-normal text-slate-400">({task.searchLog.length}회)</span>
              </p>
              <div className="space-y-2">
                {task.searchLog.map((log, i) => (
                  <div key={i} className="bg-white rounded-lg border border-slate-100 text-xs overflow-hidden">
                    <div className="flex items-start gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-100">
                      <span className="text-indigo-400 font-bold shrink-0">Q{i + 1}</span>
                      <span className="text-indigo-700 font-medium break-all">{log.query}</span>
                    </div>
                    {log.result && (
                      <pre className="text-slate-500 whitespace-pre-wrap font-mono leading-relaxed px-3 py-2 max-h-40 overflow-y-auto">
                        {log.result}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 원본 웹 검색 결과 */}
          {task.webResult && (
            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                웹 검색 원본 <span className="normal-case font-normal text-slate-400">({task.webResult.length.toLocaleString()} chars)</span>
              </p>
              <pre className="text-xs text-slate-500 whitespace-pre-wrap font-mono leading-relaxed bg-white rounded-lg border border-slate-100 px-3 py-2 max-h-48 overflow-y-auto">
                {task.webResult}
              </pre>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
