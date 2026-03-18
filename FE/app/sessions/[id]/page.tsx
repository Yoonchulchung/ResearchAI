"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { useParams } from "next/navigation";
import { Task } from "@/types";
import { TaskCard } from "@/sessions/components/TaskCard";
import { SessionHeader } from "@/sessions/components/SessionHeader";
import { reEvaluateConfidence } from "@/lib/api/ai";
import { SessionSkeleton } from "@/sessions/components/SessionSkeleton";
import { ChatSection } from "@/sessions/components/ChatSection";
import { SummarySection } from "@/sessions/components/SummarySection";
import { DetailPanel } from "@/sessions/components/DetailPanel";
import { TopicInput, AttachedFile } from "@/components/TopicInput";
import { ModelDefinition } from "@/types";
import { getSearchEngines, WebSearchEngine } from "@/lib/api/research";
import { useSessionData } from "./hooks/useSessionData";
import { useTaskRunner } from "./hooks/useTaskRunner";
import { useChatHandler } from "./hooks/useChatHandler";
import { useCompaction } from "./hooks/useCompaction";

const ChatInputArea = memo(function ChatInputArea({
  onSend,
  onAbort,
  generating,
  cloudAiModels,
  localAiModels,
  webEngines,
  defaultModel,
  defaultWebModel,
}: {
  onSend: (message: string, model: string) => void;
  onAbort: () => void;
  generating: boolean;
  cloudAiModels: ModelDefinition[];
  localAiModels: ModelDefinition[];
  webEngines: WebSearchEngine[];
  defaultModel: string;
  defaultWebModel: string;
}) {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [selectedWebModel, setSelectedWebModel] = useState(defaultWebModel);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  useEffect(() => { setSelectedModel(defaultModel); }, [defaultModel]);
  useEffect(() => { setSelectedWebModel(defaultWebModel); }, [defaultWebModel]);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg || generating) return;
    setValue("");
    onSend(msg, selectedModel);
  }, [value, generating, selectedModel, onSend]);

  return (
    <TopicInput
      value={value}
      onChange={setValue}
      onGenerate={handleSend}
      onAbort={onAbort}
      generating={generating}
      placeholder="리서치 내용에 대해 질문하세요..."
      generatingLabel="AI가 답변을 생성하고 있습니다..."
      cloudAiModels={cloudAiModels}
      localAiModels={localAiModels}
      webEngines={webEngines}
      selectedCloudAiModel={selectedModel}
      selectedLocalAiModel={selectedModel}
      selectedWebModel={selectedWebModel}
      onCloudAiModelChange={setSelectedModel}
      onLocalAiModelChange={setSelectedModel}
      onWebModelChange={setSelectedWebModel}
      dropdownDirection="up"
      attachedFiles={attachedFiles}
      onAttachedFilesChange={setAttachedFiles}
    />
  );
});

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();

  const { session, loading, models } = useSessionData(id);
  const { statuses, phases, aiResult, webModel, isRunning, handleRunTask, handleRunAll, handleCancelAll, handleCancelItem, handleDeleteItem } = useTaskRunner(session, id);
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(false);
  const [expandedDetail, setExpandedDetail] = useState(false);
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

  useEffect(() => { setDeletedItemIds(new Set()); }, [id]);
  useEffect(() => { setShowDetail(false); setExpandedDetail(false); }, [id]);

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
    <div className="h-full flex flex-col overflow-hidden">
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
        onToggleDetail={() => setShowDetail((v) => !v)}
        onReEvaluateAll={handleReEvaluateAll}
      />

      <div className="flex flex-1 min-h-0">
        {/* 왼쪽: 태스크 목록 + 채팅 */}
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden relative ${expandedDetail ? "hidden" : ""}`}>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="px-6">
              <SummarySection sessionId={id} topic={session.topic} localAiModels={models.filter((m) => m.provider === "ollama")} allDone={allDone} summaryState={session.summaryState ?? null} />
            </div>

            <div className="space-y-3 px-6">
              {tasks.map((task) => {
                const mergedTask = confidenceOverrides[task.itemId]
                  ? { ...task, confidence: confidenceOverrides[task.itemId] }
                  : task;
                return (
                  <TaskCard
                    key={task.id}
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
                    onConfidenceUpdate={(c) => handleConfidenceUpdate(task.itemId, c)}
                  />
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

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-white/95 to-transparent backdrop-blur-[2px] mask-[linear-gradient(to_top,white_40%,transparent)]" />

          <div className="px-8 relative z-10 pb-4">
            <ChatInputArea
              onSend={handleChatSend}
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

        {/* 오른쪽: 한 번에 보기 패널 */}
        {showDetail && (
          <DetailPanel
            session={session}
            expanded={expandedDetail}
            onExpand={() => setExpandedDetail((v) => !v)}
            onClose={() => { setShowDetail(false); setExpandedDetail(false); }}
          />
        )}
      </div>
    </div>
  );
}
