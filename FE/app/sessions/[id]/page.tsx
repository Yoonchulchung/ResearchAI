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
import { ChatInputArea } from "@/sessions/components/ChatInputArea";
import { DetailPanel } from "@/sessions/components/DetailPanel";
import { useTheme } from "@/contexts/ThemeContext";
import { getSearchEngines, WebSearchEngine } from "@/lib/api/research";
import { useSessionData } from "./hooks/useSessionData";
import { useTaskRunner } from "./hooks/useTaskRunner";
import { useChatHandler } from "./hooks/useChatHandler";
import { useCompaction } from "./hooks/useCompaction";
import { TaskPanel, TaskPanelTab } from "@/sessions/components/TaskPanel";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const { uiStyle } = useTheme();

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
        onRunAll={handleRunAll}
        onCancel={handleCancelAll}
        onExport={exportMarkdown}
        onToggleDetail={() => setShowDetail((v) => {
          try { sessionStorage.setItem(`detail-open:${id}`, v ? "0" : "1"); } catch {}
          return !v;
        })}
        onReEvaluateAll={handleReEvaluateAll}
      />

      <div className="flex flex-1 min-h-0">
        {/* 왼쪽: 태스크 목록 + 채팅 */}
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden relative transition-[padding-right] duration-300 ease-in-out ${expandedDetail ? "hidden" : (showDetail || showTaskPanel) ? "md:pr-[52%]" : "pr-0"}`}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-3 px-6">
              {tasks.map((task) => {
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

          <div className="px-8 relative z-10 pb-4">
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
