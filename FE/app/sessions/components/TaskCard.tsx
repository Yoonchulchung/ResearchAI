"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Task, TaskStatus, WebModels, ModelDefinition } from "@/types";
import { markdownComponents } from "@/lib/markdown";
import { reEvaluateConfidence } from "@/lib/api/ai";

export type Phase = "searching" | "analyzing";

export type WebModelKey = keyof WebModels & string;

export const SOURCE_LABELS: { key: WebModelKey; label: string }[] = [
  { key: "tavily", label: "Tavily" },
  { key: "serper", label: "Serper" },
  { key: "naver", label: "네이버" },
  { key: "brave", label: "Brave" },
  { key: "duckduckgo", label: "DuckDuckGo" },
  { key: "ollama", label: "Ollama 압축" },
];

const STATUS_LEFT_BORDER: Record<TaskStatus, string> = {
  [TaskStatus.DONE]: "border-l-emerald-400",
  [TaskStatus.RUNNING]: "border-l-indigo-400",
  [TaskStatus.PENDING]: "border-l-amber-400",
  [TaskStatus.ERROR]: "border-l-red-400",
  [TaskStatus.STOPPED]: "border-l-slate-300",
  [TaskStatus.ABORTED]: "border-l-slate-300",
  [TaskStatus.IDLE]: "border-l-slate-200",
};

const BADGE_STYLE: Record<TaskStatus, string> = {
  [TaskStatus.DONE]: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  [TaskStatus.RUNNING]: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  [TaskStatus.PENDING]: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  [TaskStatus.ERROR]: "bg-red-50 text-red-600 ring-1 ring-red-200",
  [TaskStatus.STOPPED]: "bg-slate-100 text-slate-500",
  [TaskStatus.ABORTED]: "bg-slate-100 text-slate-500",
  [TaskStatus.IDLE]: "bg-slate-100 text-slate-500",
};

const BADGE_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.DONE]: "완료",
  [TaskStatus.RUNNING]: "실행 중",
  [TaskStatus.PENDING]: "대기 중",
  [TaskStatus.ERROR]: "오류",
  [TaskStatus.STOPPED]: "중단",
  [TaskStatus.ABORTED]: "취소",
  [TaskStatus.IDLE]: "대기",
};

const MARKDOWN_PROSE = `px-5 py-4 bg-slate-50/60 max-h-[65vh] overflow-y-auto prose prose-sm prose-slate max-w-none
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
  [&_hr]:border-slate-200 [&_hr]:my-3`;

export function TaskCard({
  task,
  status,
  phase,
  aiResult,
  webModel,
  aiModel,
  models,
  cloudAiModels,
  filterModels,
  webEngines,
  syncedCloudAiModel,
  syncedWebModel,
  syncedFilterModel,
  onRun,
  onCancel,
  onDelete,
  onConfidenceUpdate,
}: {
  task: Task;
  status: TaskStatus;
  phase?: Phase;
  aiResult?: string;
  webModel?: WebModels;
  aiModel?: string;
  models?: ModelDefinition[];
  cloudAiModels?: ModelDefinition[];
  filterModels?: ModelDefinition[];
  webEngines?: { id: string; name: string; builtin: boolean }[];
  syncedCloudAiModel?: string;
  syncedWebModel?: string;
  syncedFilterModel?: string;
  onRun: (cloudAiModel?: string, webModel?: string, filterModel?: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onConfidenceUpdate?: (confidence: { score: number; reason: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"result" | "detail" | WebModelKey>("result");
  const [reEvalModel, setReEvalModel] = useState(aiModel ?? "claude-haiku-4-5-20251001");
  const [reEvalLoading, setReEvalLoading] = useState(false);
  const [reEvalError, setReEvalError] = useState<string | null>(null);
  const [selectedRunModel, setSelectedRunModel] = useState(() => syncedCloudAiModel ?? cloudAiModels?.[0]?.id ?? "");
  const [selectedRunWebModel, setSelectedRunWebModel] = useState(() => syncedWebModel ?? webEngines?.[0]?.id ?? "");
  const [selectedRunFilterModel, setSelectedRunFilterModel] = useState(() => syncedFilterModel || filterModels?.[0]?.id || "");

  useEffect(() => {
    if (syncedCloudAiModel) setSelectedRunModel(syncedCloudAiModel);
  }, [syncedCloudAiModel]);

  useEffect(() => {
    if (syncedWebModel) setSelectedRunWebModel(syncedWebModel);
  }, [syncedWebModel]);

  useEffect(() => {
    if (syncedFilterModel) setSelectedRunFilterModel(syncedFilterModel);
  }, [syncedFilterModel]);

  useEffect(() => {
    if (!selectedRunModel && cloudAiModels && cloudAiModels.length > 0) {
      setSelectedRunModel(cloudAiModels[0].id);
    }
  }, [cloudAiModels, selectedRunModel]);

  useEffect(() => {
    if (!selectedRunWebModel && webEngines && webEngines.length > 0) {
      setSelectedRunWebModel(webEngines[0].id);
    }
  }, [webEngines, selectedRunWebModel]);

  useEffect(() => {
    if (!selectedRunFilterModel && filterModels && filterModels.length > 0) {
      setSelectedRunFilterModel(filterModels[0].id);
    }
  }, [filterModels, selectedRunFilterModel]);

  const isNonBuiltinWebEngine = !!webEngines?.find((e) => e.id === selectedRunWebModel && !e.builtin);

  useEffect(() => {
    if (aiModel) setReEvalModel(aiModel);
  }, [aiModel]);

  const handleReEvaluate = async () => {
    if (!task.itemId || reEvalLoading) return;
    setReEvalLoading(true);
    setReEvalError(null);
    try {
      const confidence = await reEvaluateConfidence(task.itemId, reEvalModel);
      onConfidenceUpdate?.(confidence);
    } catch (e) {
      setReEvalError(e instanceof Error ? e.message : "재평가 실패");
    } finally {
      setReEvalLoading(false);
    }
  };

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 320);
    }
  }, [expanded]);

  useEffect(() => {
    if (expanded) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const availableSources = SOURCE_LABELS.filter((s) => webModel?.[s.key]);
  const hasContent = !!aiResult || availableSources.length > 0;

  useEffect(() => {
    if (availableSources.length > 0 && status === TaskStatus.RUNNING) {
      setExpanded(true);
      if (activeTab === "result" && !aiResult) {
        setActiveTab(availableSources[0].key);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSources.length]);

  useEffect(() => {
    if (status === TaskStatus.DONE && aiResult) {
      setActiveTab("result");
    }
  }, [status, aiResult]);

  const badgeStyle = BADGE_STYLE[status] ?? "bg-slate-100 text-slate-500";
  const badgeLabel = status === TaskStatus.RUNNING
    ? (phase === "searching" ? "검색 중" : "분석 중")
    : BADGE_LABEL[status] ?? "대기";

  const subText =
    status === TaskStatus.IDLE
      ? "클릭하여 분석 시작"
      : status === TaskStatus.PENDING
      ? "큐 대기 중..."
      : status === TaskStatus.RUNNING && phase === "searching"
      ? `웹 검색 중...${availableSources.length > 0 ? ` · ${availableSources.length}개 완료` : ""}`
      : status === TaskStatus.RUNNING && phase === "analyzing"
      ? `AI 분석 중...${hasContent ? " · 클릭하여 검색 결과 보기" : ""}`
      : status === TaskStatus.DONE
      ? "클릭하여 결과 보기"
      : status === TaskStatus.STOPPED || status === TaskStatus.ABORTED
      ? "중단됨"
      : "...";

  const [animatedText, setAnimatedText] = useState(subText);
  useEffect(() => {
    setAnimatedText("");
    let i = 0;
    const timer = setInterval(() => {
      i += 2.5;
      setAnimatedText(subText.slice(0, i));
      if (i >= subText.length) clearInterval(timer);
    }, 15);
    return () => clearInterval(timer);
  }, [subText]);

  const handleCardClick = () => {
    if (status === TaskStatus.IDLE) onRun(selectedRunModel || undefined, selectedRunWebModel || undefined, isNonBuiltinWebEngine ? selectedRunFilterModel || undefined : undefined);
    else if (hasContent) setExpanded((e) => !e);
  };

  const leftBorder = STATUS_LEFT_BORDER[status] ?? "border-l-slate-200";

  return (
    <div
      ref={cardRef}
      className={`rounded-xl bg-white shadow-sm border border-slate-200/60 border-l-4 ${leftBorder} overflow-hidden transition-all`}
    >
      {/* Card Header */}
      <div
        onClick={handleCardClick}
        style={{
          cursor: status === "idle" || hasContent ? "pointer" : "default",
        }}
        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
          status === "running" ? "bg-indigo-50/50" : "hover:bg-slate-50/60"
        }`}
      >
        {/* Status Icon */}
        <div className="shrink-0">
          {status === TaskStatus.RUNNING ? (
            <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin inline-block" />
          ) : status === TaskStatus.DONE ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-emerald-500">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5 8.5L7 10.5L11 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : status === TaskStatus.ERROR ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-red-400">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 5V8.5M8 11H8.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : status === TaskStatus.PENDING ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-amber-400">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-slate-300">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 text-sm leading-snug truncate">
            {task.title}
          </div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{animatedText}</div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {availableSources.length > 0 && (
            <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
              {availableSources.length}개
            </span>
          )}
          {status === TaskStatus.DONE && task.confidence != null && (
            <span
              title={task.confidence.reason}
              className={`text-xs font-bold px-2 py-0.5 rounded-full cursor-help tabular-nums ${
                task.confidence.score >= 71
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : task.confidence.score >= 41
                  ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  : "bg-red-50 text-red-600 ring-1 ring-red-200"
              }`}
            >
              {task.confidence.score}%
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeStyle}`}>
            {badgeLabel}
          </span>
          {status === "running" && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-xs text-slate-400 hover:text-red-500 w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 transition-colors"
              title="중단"
            >
              ✕
            </button>
          )}
          {(status === TaskStatus.IDLE || status === "error" || status === TaskStatus.STOPPED || status === TaskStatus.ABORTED) && (
            <>
              {cloudAiModels && cloudAiModels.length > 0 && (
                <select
                  value={selectedRunModel}
                  onChange={(e) => { e.stopPropagation(); setSelectedRunModel(e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-slate-500 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 focus:outline-none cursor-pointer max-w-28 truncate"
                >
                  {cloudAiModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
              {webEngines && webEngines.length > 0 && (
                <select
                  value={selectedRunWebModel}
                  onChange={(e) => { e.stopPropagation(); setSelectedRunWebModel(e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-slate-500 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 focus:outline-none cursor-pointer max-w-28 truncate"
                >
                  {webEngines.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
              {isNonBuiltinWebEngine && filterModels && filterModels.length > 0 && (
                <select
                  value={selectedRunFilterModel}
                  onChange={(e) => { e.stopPropagation(); setSelectedRunFilterModel(e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-slate-500 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 focus:outline-none cursor-pointer max-w-28 truncate"
                  title="필터 모델"
                >
                  {filterModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
              {(status === "error" || status === TaskStatus.STOPPED || status === TaskStatus.ABORTED) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRun(selectedRunModel || undefined, selectedRunWebModel || undefined, isNonBuiltinWebEngine ? selectedRunFilterModel || undefined : undefined); }}
                  className="text-xs text-slate-400 hover:text-indigo-600 w-6 h-6 flex items-center justify-center rounded-md hover:bg-indigo-50 transition-colors"
                  title="재시도"
                >
                  ↺
                </button>
              )}
            </>
          )}
          {status !== TaskStatus.RUNNING && status !== TaskStatus.PENDING && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-xs text-slate-200 hover:text-red-400 w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 transition-colors"
              title="삭제"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 3H10M4.5 3V2H7.5V3M5 5.5V9M7 5.5V9M3 3L3.5 10H8.5L9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          {hasContent && (
            <span className={`text-slate-300 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Expandable Content */}
      {hasContent && (
        <div
          style={{
            display: "grid",
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transition: "grid-template-rows 0.28s ease",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div className="border-t border-slate-100">
              {/* Tab Bar */}
              <div className="flex gap-0.5 px-4 pt-2.5 pb-0 bg-slate-50/80 overflow-x-auto">
                {[
                  { key: "result" as const, label: "AI 결과" },
                  ...availableSources.map(({ key, label }) => ({ key: key as "result" | "detail" | WebModelKey, label })),
                  { key: "detail" as const, label: "상세" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-t-md border-b-2 transition-all whitespace-nowrap ${
                      activeTab === key
                        ? "border-indigo-500 text-indigo-700 bg-white shadow-sm"
                        : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === "detail" ? (
                <div className="px-5 py-4 bg-slate-50/60 max-h-[65vh] overflow-y-auto space-y-5">
                  {/* 신뢰도 */}
                  {task.confidence != null ? (() => {
                    const isError = task.confidence.reason.startsWith("신뢰도 평가 중 오류");
                    return (
                      <section>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">신뢰도 평가</p>
                        {isError ? (
                          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                            <p className="text-xs font-semibold text-red-600">평가 실패</p>
                            <p className="text-xs text-red-500 leading-relaxed break-all">{task.confidence.reason}</p>
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
                              }`}>
                                {task.confidence.score}%
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed bg-white rounded-lg border border-slate-100 px-3 py-2">
                              {task.confidence.reason}
                            </p>
                          </>
                        )}
                      </section>
                    );
                  })() : (
                    <section>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">신뢰도 평가</p>
                      <p className="text-xs text-slate-400">신뢰도 데이터가 없습니다.</p>
                    </section>
                  )}

                  {/* 신뢰도 재평가 */}
                  {task.itemId && status === TaskStatus.DONE && (
                    <section>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">신뢰도 재평가</p>
                      <div className="flex gap-2 items-center">
                        {models && models.length > 0 ? (
                          <select
                            value={reEvalModel}
                            onChange={(e) => setReEvalModel(e.target.value)}
                            className="flex-1 min-w-0 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                          >
                            {models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.provider})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={reEvalModel}
                            onChange={(e) => setReEvalModel(e.target.value)}
                            placeholder="모델 ID (예: claude-haiku-4-5-20251001)"
                            className="flex-1 min-w-0 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                          />
                        )}
                        <button
                          onClick={handleReEvaluate}
                          disabled={reEvalLoading || !reEvalModel.trim()}
                          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {reEvalLoading ? (
                            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : "재평가"}
                        </button>
                      </div>
                      {reEvalError && (
                        <p className="mt-1.5 text-xs text-red-500">{reEvalError}</p>
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
                        <span className="text-slate-500 font-mono text-2xs">{task.itemId || "—"}</span>
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
              ) : activeTab === "result" ? (
                aiResult ? (
                  <div className={MARKDOWN_PROSE}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{aiResult}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="px-5 py-10 bg-slate-50/60 flex flex-col items-center gap-3 text-slate-400">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="text-xs">AI가 검색 결과를 분석하고 있습니다...</p>
                  </div>
                )
              ) : (
                <div className={MARKDOWN_PROSE}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {webModel?.[activeTab as WebModelKey] ?? ""}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
