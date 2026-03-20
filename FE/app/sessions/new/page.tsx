"use client";

import { TopicInput, AttachedFile } from "@/components/TopicInput";
import { ModelSelector } from "@/components/ModelSelector";
import { TaskList } from "@/sessions/components/TaskList";
import { PipelineTerminal } from "@/sessions/components/PipelineTerminal";
import { useState } from "react";
import { useModels } from "./hooks/useModels";
import { useNewSession } from "./hooks/useNewSession";
import { JobPostingList } from "./components/JobPostingList";
import { TaskChatBar } from "./components/TaskChatBar";

export default function NewSession() {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const { cloudAiModels, localAiModels, isLoading, models } = useModels();
  const {
    topic, setTopic,
    sessionTitle, setSessionTitle,
    generatingTitle,
    selectedCloudAiModel, setSelectedCloudAiModel,
    selectedLocalAiModel, setSelectedLocalAiModel,
    selectedWebModel, setSelectedWebModel,
    webEngines,
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
            models={cloudAiModels}
            selectedModel={selectedCloudAiModel}
            onSelect={setSelectedCloudAiModel}
            loading={isLoading}
            defaultOpen={false}
          />

          {/* 로컬 모델 */}
          <ModelSelector
            title="로컬 모델 (Ollama)"
            models={localAiModels}
            selectedModel={selectedLocalAiModel}
            onSelect={setSelectedLocalAiModel}
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
            cloudAiModels={cloudAiModels}
            localAiModels={localAiModels}
            webEngines={webEngines}
            selectedCloudAiModel={selectedCloudAiModel}
            selectedLocalAiModel={selectedLocalAiModel}
            selectedWebModel={selectedWebModel}
            onCloudAiModelChange={setSelectedCloudAiModel}
            onLocalAiModelChange={setSelectedLocalAiModel}
            onWebModelChange={setSelectedWebModel}
            dropdownDirection="down"
            attachedFiles={attachedFiles}
            onAttachedFilesChange={setAttachedFiles}
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
              model={selectedCloudAiModel}
              onUpdate={updateTask}
              onRemove={removeTask}
              onAdd={addTask}
              searchSource={searchSource}
            />
          </div>

          {/* 세션 제목 (태스크 생성 후 표시) */}
          {tasks.length > 0 && (
            <div className="bg-white border border-slate-200/60 rounded-xl px-5 py-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
                  <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
                <span className="text-xs font-semibold text-slate-500">세션 제목</span>
                {generatingTitle && (
                  <span className="flex items-center gap-1 text-xs text-indigo-400">
                    <span className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin inline-block" />
                    AI 생성 중...
                  </span>
                )}
              </div>
              <input
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                placeholder={generatingTitle ? "AI가 제목을 생성하고 있습니다..." : topic}
                disabled={generatingTitle}
                className="w-full text-base font-semibold text-slate-800 bg-transparent placeholder-slate-300 focus:outline-none disabled:opacity-50"
              />
              <p className="text-xs text-slate-400 mt-1.5">직접 수정할 수 있습니다</p>
            </div>
          )}

          {/* Start button */}
          {tasks.length > 0 && (
            <button
              onClick={handleResearchStart}
              disabled={creating || !topic.trim() || generatingTitle}
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
        model={selectedCloudAiModel}
        tasks={tasks}
        onTasksReplace={replaceTasks}
      />
    </div>
  );
}
