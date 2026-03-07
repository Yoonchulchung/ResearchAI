"use client";

import { TopicInput } from "@/components/TopicInput";
import { ModelSelector } from "@/components/ModelSelector";
import { TaskList } from "@/sessions/components/TaskList";
import { PipelineTerminal } from "@/sessions/components/PipelineTerminal";
import { useModels } from "./hooks/useModels";
import { useNewSession } from "./hooks/useNewSession";

export default function NewSession() {
  const { apiModels, localModels, isLoading, models } = useModels();
  const {
    topic, setTopic,
    selectedApiModel, setSelectedApiModel,
    selectedLocalModel, setSelectedLocalModel,
    tasks,
    searchSource,
    jobPostings,
    jobsExpanded, setJobsExpanded,
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
          />

          {/* Terminal log */}
          <PipelineTerminal
            logs={terminalLogs}
            progressStep={progressStep}
            onCancel={generating ? handleCancel : undefined}
          />

          {/* Job Postings */}
          {jobPostings.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setJobsExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 hover:text-slate-600 transition-colors"
              >
                <span className={`transition-transform duration-200 ${jobsExpanded ? "rotate-0" : "-rotate-90"}`}>▾</span>
                채용 공고 {jobPostings.length}건
              </button>
              {jobsExpanded && <div className="grid gap-2">
                {jobPostings.map((job, i) => (
                  <a
                    key={i}
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                          {job.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-600">{job.company}</span>
                          {job.location && <span>· {job.location}</span>}
                          {job.description && <span>· {job.description}</span>}
                        </div>
                        {job.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {job.skills.slice(0, 5).map((s, j) => (
                              <span key={j} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-medium">
                                {s}
                              </span>
                            ))}
                            {job.skills.length > 5 && (
                              <span className="text-[10px] text-slate-400">+{job.skills.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0 text-sm mt-0.5">↗</span>
                    </div>
                  </a>
                ))}
              </div>}
            </div>
          )}

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
              className="w-full bg-linear-to-r from-indigo-600 to-indigo-500 text-white font-bold text-base py-4 rounded-2xl hover:from-indigo-700 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200"
            >
              {creating ? "⏳ 세션 생성 중..." : "리서치 세션 시작"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
