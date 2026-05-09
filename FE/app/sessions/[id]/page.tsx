"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Task } from "@/types";
import { TaskCard } from "@/sessions/components/TaskCard";
import { ScrollReveal } from "@/components/ScrollReveal";
import { SessionHeader } from "@/sessions/components/SessionHeader";
import { reEvaluateConfidence } from "@/lib/api/ai";
import { SessionSkeleton } from "@/sessions/components/SessionSkeleton";
import { ChatSection } from "@/sessions/components/ChatSection";
import { SummarySection } from "@/sessions/components/SummarySection";
import { ChatInputArea } from "@/sessions/components/ChatInputArea";
import { DetailPanel } from "@/sessions/components/DetailPanel";
import { useTheme } from "@/contexts/ThemeContext";
import { getSearchEngines, WebSearchEngine } from "@/lib/api/research";
import { useSessionData } from "./hooks/useSessionData";
import { useTaskRunner } from "./hooks/useTaskRunner";
import { useChatHandler } from "./hooks/useChatHandler";
import { useCompaction } from "./hooks/useCompaction";
import { TaskPanel, TaskPanelTab } from "@/sessions/components/TaskPanel";
import { RecruitView } from "./components/RecruitView";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const { uiStyle, theme } = useTheme();
  const isDark = theme === "dark";

  const { session, loading, models } = useSessionData(id);
  const { statuses, phases, aiResult, webModel, isRunning, handleRunTask, handleRunAll, handleCancelAll, handleCancelItem, handleDeleteItem } = useTaskRunner(session, id);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 세션별 스크롤 위치 — 비율 기반으로 저장/복원 (데스크탑↔모바일 reflow 대응)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let lastRatio = 0;
    let ignoreScrollUntil = 0;

    const saveRatio = () => {
      if (performance.now() < ignoreScrollUntil) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) {
        lastRatio = el.scrollTop / max;
        sessionStorage.setItem(`scroll-ratio:${id}`, String(lastRatio));
      }
    };

    const restoreToRatio = () => {
      ignoreScrollUntil = performance.now() + 200;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = lastRatio * max;
    };

    el.addEventListener("scroll", saveRatio, { passive: true });

    const saved = sessionStorage.getItem(`scroll-ratio:${id}`);
    if (saved) {
      lastRatio = Number(saved);
      requestAnimationFrame(() => { requestAnimationFrame(restoreToRatio); });
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(restoreToRatio);
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", saveRatio);
      ro.disconnect();
    };
  }, [id]);

  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(() => {
    try { return sessionStorage.getItem(`detail-open:${id}`) === "1"; } catch { return false; }
  });
  const [expandedDetail, setExpandedDetail] = useState(() => {
    try { return sessionStorage.getItem(`detail-expanded:${id}`) === "1"; } catch { return false; }
  });
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const prevShowDetailRef = useRef(false);
  const [selectedTaskTab, setSelectedTaskTab] = useState<TaskPanelTab>("result");
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [confidenceOverrides, setConfidenceOverrides] = useState<Record<string, { score: number; reason: string }>>({});
  const [reEvalProgress, setReEvalProgress] = useState<{ done: number; total: number } | null>(null);

  const handleConfidenceUpdate = useCallback((itemId: string, confidence: { score: number; reason: string }) => {
    setConfidenceOverrides((prev) => ({ ...prev, [itemId]: confidence }));
  }, []);

  const handleReEvaluateAll = useCallback(async (model: string) => {
    if (!session) return;
    const doneTasks = (session.items ?? []).filter(
      (t) => !deletedItemIds.has(t.itemId) && (statuses[t.id] ?? t.status) === "done" && t.itemId,
    );
    if (doneTasks.length === 0) return;
    setReEvalProgress({ done: 0, total: doneTasks.length });
    for (const task of doneTasks) {
      try {
        const confidence = await reEvaluateConfidence(task.itemId, model);
        setConfidenceOverrides((prev) => ({ ...prev, [task.itemId]: confidence }));
      } catch { /* 개별 실패 무시 */ }
      setReEvalProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null);
    }
    setReEvalProgress(null);
  }, [session, statuses, deletedItemIds]);

  const [webEngines, setWebEngines] = useState<WebSearchEngine[]>([]);
  useEffect(() => { getSearchEngines().then(setWebEngines).catch(() => {}); }, []);

  const cloudAiModels = models.filter((m) => m.provider !== "ollama");
  const [headerCloudAiModel, setHeaderCloudAiModel] = useState("");
  const [headerWebModel, setHeaderWebModel] = useState("");
  const [headerFilterModel, setHeaderFilterModel] = useState("");

  // models/webEngines 로드 후 초기값 설정
  useEffect(() => {
    if (!headerCloudAiModel && models.length > 0) {
      setHeaderCloudAiModel(session?.researchCloudAIModel ?? models[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.length]);

  useEffect(() => {
    if (!headerWebModel && webEngines.length > 0) {
      setHeaderWebModel(session?.researchWebModel ?? webEngines[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webEngines.length]);

  useEffect(() => {
    if (!headerFilterModel && models.length > 0) {
      setHeaderFilterModel(models[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showTaskPanel) { setShowTaskPanel(false); return; }
      if (showDetail) {
        try { sessionStorage.setItem(`detail-open:${id}`, "0"); sessionStorage.setItem(`detail-expanded:${id}`, "0"); } catch {}
        setShowDetail(false); setExpandedDetail(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTaskPanel, showDetail, id]);

  // 모바일 뒤로 가기 — 팝업이 열려 있으면 닫고, 없으면 실제 뒤로 이동
  useEffect(() => {
    if (!showDetail && !showTaskPanel) return;
    window.history.pushState({ panelOpen: true }, "");
    const handlePopState = () => {
      if (showTaskPanel) { setShowTaskPanel(false); return; }
      if (showDetail) {
        try { sessionStorage.setItem(`detail-open:${id}`, "0"); sessionStorage.setItem(`detail-expanded:${id}`, "0"); } catch {}
        setShowDetail(false); setExpandedDetail(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showDetail, showTaskPanel, id]);

  useEffect(() => { setDeletedItemIds(new Set()); }, [id]);
  useEffect(() => {
    try {
      setShowDetail(sessionStorage.getItem(`detail-open:${id}`) === "1");
      setExpandedDetail(sessionStorage.getItem(`detail-expanded:${id}`) === "1");
    } catch {}
  }, [id]);

  const { chatMessages, chatLoading, chatBottomRef, handleChatSend, handleClearChat, handleChatAbort } = useChatHandler(session, id);
  const { compactionStatus } = useCompaction(session, statuses, isRunning, id);

  if (loading) return <SessionSkeleton />;
  if (!session) return null;

  if (session.sessionType === "recruit") {
    return (
      <div className="h-full flex flex-col overflow-hidden font-system">
        <RecruitView session={session} />
      </div>
    );
  }

  const tasks: Task[] = (session.items ?? []).filter((t) => !deletedItemIds.has(t.itemId));
  const doneCount = Object.values(statuses).filter((s) => s === "done").length;
  const total = tasks.length;
  const allDone = doneCount === total && total > 0 && !isRunning;
  const hasDoneTasks = doneCount > 0;

  const avgConfidence = (() => {
    const scores = tasks
      .map((t) => (confidenceOverrides[t.itemId] ?? t.confidence)?.score)
      .filter((s): s is number => s !== undefined && s !== null);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  })();

  const totalInputTokens = tasks.reduce((s, t) => s + (t.inputTokens ?? 0), 0) || null;
  const totalOutputTokens = tasks.reduce((s, t) => s + (t.outputTokens ?? 0), 0) || null;
  const totalFees = tasks.reduce((s, t) => s + (t.estimatedFees ?? 0), 0) || null;

  const exportMarkdown = () => {
    const lines = [
      `# ${session.topic} - 리서치 결과`,
      `> 생성일: ${new Date(session.createdAt).toLocaleString("ko-KR")}`,
      "",
    ];
    for (const task of tasks) {
      lines.push(`## ${task.title}`);
      lines.push(aiResult[task.id] ?? "*(미완료)*");
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.topic.replace(/\s+/g, "_")}_리서치.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden relative font-system">
      <div className="hidden md:block">
        <SessionHeader
          topic={session.topic}
          model={session.researchCloudAIModel}
          isRunning={isRunning}
          allDone={allDone}
          hasDoneTasks={hasDoneTasks}
          showDetail={showDetail}
          models={models}
          cloudAiModels={models}
          filterModels={models}
          webEngines={webEngines}
          selectedCloudAiModel={headerCloudAiModel}
          selectedWebModel={headerWebModel}
          selectedFilterModel={headerFilterModel}
          onCloudAiModelChange={setHeaderCloudAiModel}
          onWebModelChange={setHeaderWebModel}
          onFilterModelChange={setHeaderFilterModel}
          reEvalProgress={reEvalProgress}
          avgConfidence={avgConfidence}
          totalInputTokens={totalInputTokens}
          totalOutputTokens={totalOutputTokens}
          totalFees={totalFees}
          onRunAll={handleRunAll}
          onCancel={handleCancelAll}
          onExport={exportMarkdown}
          onToggleDetail={() => setShowDetail((v) => {
            try { sessionStorage.setItem(`detail-open:${id}`, v ? "0" : "1"); } catch {}
            return !v;
          })}
          onReEvaluateAll={handleReEvaluateAll}
        />
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 왼쪽: 태스크 목록 + 채팅 */}
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden relative transition-[padding-right] duration-300 ease-in-out ${expandedDetail ? "hidden" : (showDetail || showTaskPanel) ? "md:pr-[52%]" : "pr-0"}`}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-2.5 sm:px-8 py-3 sm:py-6">
            <div className="md:hidden mb-3 flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {cloudAiModels.length > 0 && !allDone && (
                <select
                  value={headerCloudAiModel}
                  onChange={(e) => setHeaderCloudAiModel(e.target.value)}
                  className={`min-w-[9rem] max-w-[11rem] rounded-lg border px-2.5 py-2 text-xs ${isDark ? "bg-white/10 border-white/10 text-slate-200" : "bg-white border-slate-200 text-slate-700"}`}
                >
                  {cloudAiModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
              {webEngines.length > 0 && !allDone && (
                <select
                  value={headerWebModel}
                  onChange={(e) => setHeaderWebModel(e.target.value)}
                  className={`min-w-[9rem] max-w-[11rem] rounded-lg border px-2.5 py-2 text-xs ${isDark ? "bg-white/10 border-white/10 text-slate-200" : "bg-white border-slate-200 text-slate-700"}`}
                >
                  {webEngines.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
              {isRunning ? (
                <button
                  onClick={handleCancelAll}
                  className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-500"
                >
                  중단
                </button>
              ) : !allDone ? (
                <button
                  onClick={() => handleRunAll(headerCloudAiModel, headerWebModel)}
                  className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  전체 실행
                </button>
              ) : hasDoneTasks ? (
                <button
                  onClick={exportMarkdown}
                  className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white"
                >
                  내보내기
                </button>
              ) : null}
            </div>
            <SummarySection
              sessionId={id}
              topic={session.topic}
              cloudAiModels={cloudAiModels}
              allDone={allDone}
              summaryState={session.summaryState}
            />
            <div className={`bg-transparent sm:bg-white sm:dark:bg-black/20 sm:border ${isDark ? "sm:border-slate-800" : "sm:border-slate-200"} rounded-none sm:rounded-sm shadow-none sm:shadow-sm mb-5 sm:mb-8`}>
              <div className={`px-1 sm:px-6 py-2 sm:py-4 flex items-center justify-between sm:border-b ${isDark ? "sm:border-slate-800" : "sm:border-slate-100"}`}>
                <h2 className={`text-sm sm:text-[15px] font-bold tracking-wide ${isDark ? "text-slate-200" : "text-slate-800"} uppercase`}>수행 중인 리서치</h2>
                <span className={`text-[10px] uppercase font-bold tracking-widest border px-1.5 py-0.5 rounded-sm ${isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
                  TOTAL {total}
                </span>
              </div>
              <div className="px-1 sm:p-6 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 items-start">
              {tasks.length === 0 ? (
                <div className={`rounded-xl border px-4 py-5 text-sm ${isDark ? "border-slate-800 text-slate-400 bg-white/5" : "border-slate-200 text-slate-500 bg-white"}`}>
                  아직 생성된 리서치 항목이 없습니다.
                </div>
              ) : tasks.map((task) => {
                const mergedTask = confidenceOverrides[task.itemId]
                  ? { ...task, confidence: confidenceOverrides[task.itemId] }
                  : task;
                return (
                  <ScrollReveal key={task.id}>
                    <TaskCard
                      task={mergedTask}
                      status={statuses[task.id] ?? "idle"}
                      phase={phases[task.id]}
                      aiResult={aiResult[task.id]}
                      webModel={webModel[task.id]}
                      aiModel={session.researchCloudAIModel}
                      models={models}
                      cloudAiModels={models}
                      filterModels={models}
                      webEngines={webEngines}
                      syncedCloudAiModel={headerCloudAiModel}
                      syncedWebModel={headerWebModel}
                      syncedFilterModel={headerFilterModel}
                      onRun={(aiModel, runWebModel, filterModel) => handleRunTask(task, aiModel, runWebModel, filterModel)}
                      onCancel={() => handleCancelItem(task)}
                      onDelete={() => handleDeleteItem(task, () => setDeletedItemIds((prev: Set<string>) => new Set([...prev, task.itemId])))}
                      onOpen={(tab) => {
                        if (tab === "result") {
                          // 카드 클릭 → 한 번에 보기 (DetailPanel)
                          if (showDetail && selectedTaskId === task.id && !showTaskPanel) {
                            setShowDetail(false);
                            prevShowDetailRef.current = false;
                          } else {
                            prevShowDetailRef.current = showDetail && !showTaskPanel;
                            setSelectedTaskId(task.id); setShowDetail(true); setShowTaskPanel(false);
                            try { sessionStorage.setItem(`detail-open:${id}`, "1"); } catch {}
                          }
                        } else {
                          // 상세/DDG 버튼 → TaskPanel
                          if (showTaskPanel && selectedTaskId === task.id && selectedTaskTab === tab) {
                            setShowTaskPanel(false);
                          } else {
                            setSelectedTaskId(task.id); setSelectedTaskTab(tab); setShowTaskPanel(true); setShowDetail(false);
                          }
                        }
                      }}
                      onConfidenceUpdate={(c) => handleConfidenceUpdate(task.itemId, c)}
                    />
                  </ScrollReveal>
                );
              })}
                </div>
              </div>
            </div>

            <ChatSection
              chatMessages={chatMessages}
              chatBottomRef={chatBottomRef}
              onClearChat={handleClearChat}
              onAbort={handleChatAbort}
              chatLoading={chatLoading}
              compactionStatus={compactionStatus}
            />
          </div>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 backdrop-blur-[6px] [mask-image:linear-gradient(to_top,black_40%,transparent)]" />

          <div className="px-2.5 sm:px-8 relative z-10 pb-2.5 sm:pb-4">
            <ChatInputArea
              onSend={(msg, model, attachedTexts) => handleChatSend(msg, model, attachedTexts)}
              onAbort={handleChatAbort}
              generating={chatLoading}
              cloudAiModels={cloudAiModels}
              localAiModels={models.filter((m) => m.provider === "ollama")}
              webEngines={webEngines}
              defaultModel={session.researchCloudAIModel}
              defaultWebModel={session.researchWebModel ?? "anthropic-builtin"}
            />
          </div>
        </div>

      </div>

      {/* 오른쪽 패널 (전체 높이 오버레이 또는 플로팅 아일랜드)
          모바일(<768px): 오른쪽에서 슬라이드-인하는 전체 화면 오버레이 */}
      <div className={`absolute z-30 transition-all duration-300 ease-in-out overflow-hidden shadow-2xl ${
        uiStyle === "glass"
          ? "top-0 bottom-0 right-0 md:top-3 md:bottom-4 md:right-3 md:rounded-2xl md:border md:border-white/20"
          : "top-0 bottom-0 right-0 md:inset-y-0 md:border-l md:border-slate-200"
      } ${
        (showDetail || showTaskPanel)
          ? (expandedDetail ? "w-full md:w-[calc(100%-1.5rem)]" : "w-full md:w-[calc(52%-0.75rem)]")
          : "w-0 !border-none"
      }`}>
        {showTaskPanel && selectedTaskId != null ? (() => {
          const selectedTask = tasks.find((t) => t.id === selectedTaskId);
          if (!selectedTask) return null;
          return (
            <TaskPanel
              task={selectedTask}
              aiResult={aiResult[selectedTaskId]}
              webModel={webModel[selectedTaskId]}
              initialTab={selectedTaskTab}
              onClose={() => setShowTaskPanel(false)}
            />
          );
        })() : showDetail ? (
          <DetailPanel
            session={session}
            sessionId={id}
            expanded={expandedDetail}
            selectedTaskId={selectedTaskId}
            instantScroll={prevShowDetailRef.current}
            onExpand={() => setExpandedDetail((v) => {
              try { sessionStorage.setItem(`detail-expanded:${id}`, v ? "0" : "1"); } catch {}
              return !v;
            })}
            onClose={() => {
              try { sessionStorage.setItem(`detail-open:${id}`, "0"); sessionStorage.setItem(`detail-expanded:${id}`, "0"); } catch {}
              setShowDetail(false);
              setExpandedDetail(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
