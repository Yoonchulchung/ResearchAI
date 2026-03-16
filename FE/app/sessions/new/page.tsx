"use client";

import { TopicInput } from "@/components/TopicInput";
import { ModelSelector } from "@/components/ModelSelector";
import { TaskList } from "@/sessions/components/TaskList";
import { PipelineTerminal } from "@/sessions/components/PipelineTerminal";
import { useModels } from "./hooks/useModels";
import { useNewSession } from "./hooks/useNewSession";
import { JobPostingList } from "./components/JobPostingList";
import { TaskChatBar } from "./components/TaskChatBar";

export default function NewSession() {
  const { apiModels, localModels, isLoading, models } = useModels();
  const {
    topic, setTopic,
    selectedApiModel, setSelectedApiModel,
    selectedLocalModel, setSelectedLocalModel,
    tasks,
    searchSource,
    jobPostings,
    generating,
    progressStep,
    terminalLogs,
    creating,
    error,
    taskListRef,
    handleGenerate,
    handleCancel,
    handleResearchStart,
    updateTask,
    removeTask,
    addTask,
    replaceTasks,
  } = useNewSession(models);

  return (
    <div className="h-full flex flex-col">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* API 모델 */}
          <ModelSelector
            title="API 모델"
            models={apiModels}
            selectedModel={selectedApiModel}
            onSelect={setSelectedApiModel}
            loading={isLoading}
            defaultOpen={false}
          />

          {/* 로컬 모델 */}
          <ModelSelector
            title="로컬 모델 (Ollama)"
            models={localModels}
            selectedModel={selectedLocalModel}
            onSelect={setSelectedLocalModel}
            loading={isLoading}
            emptyMessage="Ollama가 실행 중이지 않거나 설치된 모델이 없습니다."
            defaultOpen={false}
          />

          {/* Topic input */}
          <TopicInput
            value={topic}
            onChange={setTopic}
            onGenerate={handleGenerate}
            generating={generating}
            apiModels={apiModels}
            localModels={localModels}
            selectedApiModel={selectedApiModel}
            selectedLocalModel={selectedLocalModel}
            onApiModelChange={setSelectedApiModel}
            onLocalModelChange={setSelectedLocalModel}
            dropdownDirection="down"
          />

          {/* Terminal log */}
          <PipelineTerminal
            logs={terminalLogs}
            progressStep={progressStep}
            onCancel={generating ? handleCancel : undefined}
          />

          {/* Job Postings */}
          <JobPostingList jobPostings={jobPostings} />

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              ❌ {error}
            </div>
          )}

          {/* Tasks */}
          <div ref={taskListRef}>
            <TaskList
              tasks={tasks}
              topic={topic}
              model={selectedApiModel}
              onUpdate={updateTask}
              onRemove={removeTask}
              onAdd={addTask}
              searchSource={searchSource}
            />
          </div>

          {/* Start button */}
          {tasks.length > 0 && (
            <button
              onClick={handleResearchStart}
              disabled={creating || !topic.trim()}
              className="w-full bg-linear-to-r from-slate-400 to-slate-400 text-white font-bold text-base py-4 rounded-2xl hover:from-slate-500 hover:to-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-200"
            >
              {creating ? "세션 생성 중..." : "리서치 세션 시작"}
            </button>
          )}
        </div>
      </div>

      {/* Chat bar — fixed at bottom of main area */}
      <TaskChatBar
        topic={topic}
        model={selectedApiModel}
        tasks={tasks}
        onTasksReplace={replaceTasks}
      />
    </div>
  );
}
