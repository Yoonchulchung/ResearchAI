"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Task } from "@/types";
import { TaskCard } from "@/sessions/components/TaskCard";
import { SessionHeader } from "@/sessions/components/SessionHeader";
import { SessionSkeleton } from "@/sessions/components/SessionSkeleton";
import { ChatSection } from "@/sessions/components/ChatSection";
import { SummarySection } from "@/sessions/components/SummarySection";
import { TopicInput } from "@/components/TopicInput";
import { ModelDefinition } from "@/types";
import { useSessionData } from "./hooks/useSessionData";
import { useTaskRunner } from "./hooks/useTaskRunner";
import { useChatHandler } from "./hooks/useChatHandler";
import { useCompaction } from "./hooks/useCompaction";

const ChatInputArea = memo(function ChatInputArea({
  onSend,
  generating,
  apiModels,
  localModels,
  defaultModel,
}: {
  onSend: (message: string, model: string) => void;
  generating: boolean;
  apiModels: ModelDefinition[];
  localModels: ModelDefinition[];
  defaultModel: string;
}) {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel);

  useEffect(() => { setSelectedModel(defaultModel); }, [defaultModel]);

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
      generating={generating}
      placeholder="리서치 내용에 대해 질문하세요..."
      generatingLabel="AI가 답변을 생성하고 있습니다..."
      apiModels={apiModels}
      localModels={localModels}
      selectedApiModel={selectedModel}
      selectedLocalModel={selectedModel}
      onApiModelChange={setSelectedModel}
      onLocalModelChange={setSelectedModel}
    />
  );
});

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { session, loading, models } = useSessionData(id);
  const { statuses, phases, results, sources, isRunning, handleRunTask, handleRunAll, handleCancel } = useTaskRunner(session, id);
  const { chatMessages, chatLoading, chatBottomRef, handleChatSend, handleClearChat } = useChatHandler(session, id);
  const { compactionStatus } = useCompaction(session, statuses, isRunning, id);

  if (loading) return <SessionSkeleton />;
  if (!session) return null;

  const tasks: Task[] = session.items ?? [];
  const doneCount = Object.values(statuses).filter((s) => s === "done").length;
  const total = tasks.length;
  const allDone = doneCount === total && total > 0 && !isRunning;

  const exportMarkdown = () => {
    const lines = [
      `# ${session.topic} - 리서치 결과`,
      `> 생성일: ${new Date(session.createdAt).toLocaleString("ko-KR")}`,
      "",
    ];
    for (const task of tasks) {
      lines.push(`## ${task.icon} ${task.title}`);
      lines.push(results[task.id] ?? "*(미완료)*");
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
    <div className="h-full flex flex-col">
      <SessionHeader
        topic={session.topic}
        model={session.researchCloudAIModel}
        isRunning={isRunning}
        allDone={allDone}
        onRunAll={handleRunAll}
        onCancel={handleCancel}
        onExport={exportMarkdown}
        onViewDetail={() => router.push(`/sessions/${id}/detail`)}
      />

      <div className="bg-grey flex-1 overflow-y-auto px-8 py-6">
        <SummarySection sessionId={id} topic={session.topic} localModels={models.filter((m) => m.provider === "ollama")} allDone={allDone} />

        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              status={statuses[task.id] ?? "idle"}
              phase={phases[task.id]}
              result={results[task.id]}
              sources={sources[task.id]}
              onRun={() => handleRunTask(task)}
              onCancel={handleCancel}
            />
          ))}
        </div>

        <ChatSection
          chatMessages={chatMessages}
          chatBottomRef={chatBottomRef}
          onClearChat={handleClearChat}
          compactionStatus={compactionStatus}
        />
      </div>

      <div className="px-8 py-4 border-t border-slate-100 bg-white shrink-0">
        <ChatInputArea
          onSend={handleChatSend}
          generating={chatLoading}
          apiModels={models.filter((m) => m.provider !== "ollama")}
          localModels={models.filter((m) => m.provider === "ollama")}
          defaultModel={session.researchCloudAIModel}
        />
      </div>
    </div>
  );
}
