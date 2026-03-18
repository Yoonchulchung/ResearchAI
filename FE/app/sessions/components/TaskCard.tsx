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

  // 헤더에서 모델 변경 시 동기화
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

  // 소스가 새로 생기면 자동 펼침 (검색/분석 단계 모두)
  useEffect(() => {
    if (availableSources.length > 0 && status === TaskStatus.RUNNING) {
      setExpanded(true);
      if (activeTab === "result" && !aiResult) {
        setActiveTab(availableSources[0].key);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSources.length]);

  // 분석 완료 시 AI 결과 탭으로 이동
  useEffect(() => {
    if (status === TaskStatus.DONE && aiResult) {
      setActiveTab("result");
    }
  }, [status, aiResult]);
  
  const badgeStyleMap: Record<TaskStatus, string> = {
    [TaskStatus.DONE]: "bg-green-100 text-green-700",
    [TaskStatus.RUNNING]: "bg-indigo-100 text-indigo-700",
    [TaskStatus.PENDING]: "bg-amber-100 text-amber-700",
    [TaskStatus.ERROR]: "bg-red-100 text-red-700",
    [TaskStatus.STOPPED]: "bg-slate-100 text-slate-500",
    [TaskStatus.ABORTED]: "bg-slate-100 text-slate-500",
    [TaskStatus.IDLE]: "bg-slate-100 text-slate-500",
  };
  const badgeStyle = badgeStyleMap[status] ?? "bg-slate-100 text-slate-500";

  const badgeLabelMap: Record<TaskStatus, string> = {
    [TaskStatus.DONE]: "완료",
    [TaskStatus.RUNNING]: phase === "searching" ? "검색 중" : "분석 중",
    [TaskStatus.PENDING]: "대기 중",
    [TaskStatus.ERROR]: "오류",
    [TaskStatus.STOPPED]: "중단",
    [TaskStatus.ABORTED]: "취소",
    [TaskStatus.IDLE]: "대기",
  };
  const badgeLabel = badgeLabelMap[status] ?? "대기";

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

  return (

    
    <div
      ref={cardRef}
      className="rounded-2xl bg-white shadow-sm overflow-hidden transition-colors"
    >
      {/* 메인  헤더*/}
      <div
        onClick={handleCardClick}
        style={{
          background: status === "running" ? "#f0f0ff" : "#fff",
          cursor: status === "idle" || hasContent ? "pointer" : "default",
        }}
        className="flex items-center gap-3 px-5 py-2.5"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 text-xs">
            {task.title}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{animatedText}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {availableSources.length > 0 && (
            <span className="text-xs text-slate-400 font-medium">
              검색 {availableSources.length}개
            </span>
          )}
          {status === TaskStatus.DONE && task.confidence != null && (
            <span
              title={task.confidence.reason}
              className={`text-xs font-bold px-2 py-0.5 rounded-full cursor-help ${
                task.confidence.score >= 71
                  ? "bg-green-100 text-green-700"
                  : task.confidence.score >= 41
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {task.confidence.score}%
            </span>
          )}
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeStyle}`}>
            {badgeLabel}
          </span>
          {status === "running" && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-xs font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
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
                  className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none cursor-pointer max-w-28 truncate"
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
                  className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none cursor-pointer max-w-28 truncate"
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
                  className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none cursor-pointer max-w-28 truncate"
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
                  className="text-xs font-semibold text-slate-400 hover:text-indigo-500 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
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
              className="text-xs font-semibold text-slate-300 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              title="삭제"
            >
              🗑
            </button>
          )}
        </div>
      </div>
        
      {hasContent && (
        <div
          style={{
            display: "grid",
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transition: "grid-template-rows 0.3s ease",
          }}
        >
        <div style={{ overflow: "hidden" }}>
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
              AI 결과
            </button>
            {availableSources.map(({ key: sourceKey, label }) => (
              <button
                key={sourceKey}
                onClick={() => setActiveTab(sourceKey)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === sourceKey
                    ? "border-indigo-500 text-indigo-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setActiveTab("detail")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "detail"
                  ? "border-indigo-500 text-indigo-700 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              상세
            </button>
          </div>

          {/* 탭 콘텐츠 */}
          {activeTab === "detail" ? (
            <div className="px-5 py-4 bg-slate-50 max-h-[65vh] overflow-y-auto space-y-5">
              {/* 신뢰도 */}
              {task.confidence != null ? (() => {
                const isError = task.confidence.reason.startsWith("신뢰도 평가 중 오류");
                return (
                  <section>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">신뢰도 평가</p>
                    {isError ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                        <p className="text-xs font-semibold text-red-600">평가 실패</p>
                        <p className="text-xs text-red-500 leading-relaxed break-all">{task.confidence.reason}</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                task.confidence.score >= 71 ? "bg-green-400"
                                : task.confidence.score >= 41 ? "bg-amber-400"
                                : "bg-red-400"
                              }`}
                              style={{ width: `${task.confidence.score}%` }}
                            />
                          </div>
                          <span className={`text-sm font-bold tabular-nums ${
                            task.confidence.score >= 71 ? "text-green-600"
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
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">신뢰도 평가</p>
                  <p className="text-xs text-slate-400">신뢰도 데이터가 없습니다.</p>
                </section>
              )}

              {/* 신뢰도 재평가 */}
              {task.itemId && status === TaskStatus.DONE && (
                <section>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">신뢰도 재평가</p>
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
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">토큰 사용량</p>
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">검색 정보</p>
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
                    <span className="text-slate-500 font-mono">{task.itemId || "—"}</span>
                  </div>
                </div>
              </section>

              {/* 검색 프롬프트 */}
              <section>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">검색 프롬프트</p>
                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed bg-white rounded-lg border border-slate-100 px-3 py-2">
                  {task.webSearchPrompt || "(없음)"}
                </pre>
              </section>

              {/* AI 검색 기록 (agentic loop / Anthropic built-in) */}
              {task.searchLog && task.searchLog.length > 0 && (
                <section>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
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

              {/* 원본 웹 검색 결과 (외부 엔진 직접 검색) */}
              {task.webResult && (
                <section>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
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
              <div className="px-5 py-4 bg-slate-50 max-h-[65vh] overflow-y-auto prose prose-sm prose-slate max-w-none
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
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{aiResult}</ReactMarkdown>
              </div>
            ) : (
              <div className="px-5 py-8 bg-slate-50 flex flex-col items-center gap-2 text-slate-400">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-xs">AI가 검색 결과를 분석하고 있습니다...</p>
              </div>
            )
          ) : (
            <div className="px-5 py-4 bg-slate-50 max-h-[65vh] overflow-y-auto prose prose-sm prose-slate max-w-none
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
