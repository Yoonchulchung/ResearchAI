"use client";

import { useEffect, useRef, useState } from "react";
import { useNewSessionModal } from "@/contexts/NewSessionModalContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useModels } from "@/sessions/new/hooks/useModels";
import { useNewSession } from "@/sessions/new/hooks/useNewSession";
import { TaskList } from "@/sessions/components/TaskList";
import { PipelineTerminal } from "@/sessions/components/PipelineTerminal";
import { JobPostingList } from "@/sessions/new/components/JobPostingList";
import { TaskChatBar } from "@/sessions/new/components/TaskChatBar";

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Inner Modal Content ──────────────────────────────────────────────────────
// Separate component so it fully re-mounts when the modal reopens (via key prop)

function ModalContent({ onClose }: { onClose: () => void }) {
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

  const scrollRef = useRef<HTMLDivElement>(null);

  // 태스크 생성 후 자동 스크롤
  useEffect(() => {
    if (tasks.length > 0 && scrollRef.current) {
      setTimeout(() => {
        taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [tasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    await handleResearchStart();
    onClose();
  };

  const canGenerate = !!topic.trim() && !generating;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
        <div>
          <h2 className="text-base font-bold text-slate-900">새 리서치 세션</h2>
          <p className="text-xs text-slate-400 mt-0.5">AI가 주제를 분석하고 조사 항목을 자동으로 생성합니다</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <IconClose />
        </button>
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Topic Input */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <IconSearch />
            리서치 주제 <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (canGenerate) handleGenerate();
                }
              }}
              placeholder="어떤 주제를 리서치하시겠어요? (예: 최근 AI 반도체 시장 동향과 주요 플레이어)"
              rows={3}
              className="w-full text-sm text-slate-800 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 resize-none leading-relaxed transition-all"
            />
            <div className="absolute bottom-2.5 right-3 text-xs text-slate-300 pointer-events-none">
              ⌘↵ 생성
            </div>
          </div>
        </div>

        {/* Model Selectors Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Cloud AI Model */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
              Cloud AI 모델
            </label>
            {isLoading ? (
              <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
            ) : (
              <select
                value={selectedCloudAiModel}
                onChange={(e) => setSelectedCloudAiModel(e.target.value)}
                className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 cursor-pointer"
              >
                {cloudAiModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Web Engine */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
              웹 검색 엔진
            </label>
            {isLoading ? (
              <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
            ) : (
              <select
                value={selectedWebModel}
                onChange={(e) => setSelectedWebModel(e.target.value)}
                className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 cursor-pointer"
              >
                {webEngines.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Local AI Model */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
              로컬 모델 (요약)
            </label>
            {isLoading ? (
              <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
            ) : localAiModels.length === 0 ? (
              <div className="h-9 flex items-center px-3 text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg">
                Ollama 모델 없음
              </div>
            ) : (
              <select
                value={selectedLocalAiModel}
                onChange={(e) => setSelectedLocalAiModel(e.target.value)}
                className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 cursor-pointer"
              >
                {localAiModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-200"
        >
          {generating ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              조사 항목 생성 중...
            </>
          ) : (
            <>
              <IconSparkle />
              AI로 조사 항목 자동 생성
            </>
          )}
        </button>

        {/* Pipeline Terminal */}
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
            {error}
          </div>
        )}

        {/* Task List */}
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

        {/* Session Title (AI 생성) */}
        {tasks.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <IconSparkle />
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
              className="w-full text-sm font-semibold text-slate-800 bg-transparent placeholder-slate-300 focus:outline-none disabled:opacity-50"
            />
            <p className="text-xs text-slate-400 mt-1">직접 수정할 수 있습니다</p>
          </div>
        )}
      </div>

      {/* ── Chat Bar ────────────────────────────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className="shrink-0 border-t border-slate-100">
          <TaskChatBar
            topic={topic}
            model={selectedCloudAiModel}
            tasks={tasks}
            onTasksReplace={replaceTasks}
          />
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-white">
        <div className="text-xs text-slate-400">
          {tasks.length > 0
            ? `${tasks.length}개 조사 항목`
            : "주제를 입력하고 조사 항목을 생성해주세요"}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleStart}
            disabled={creating || !topic.trim() || tasks.length === 0 || generatingTitle}
            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-100"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                생성 중...
              </span>
            ) : "리서치 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────

export function NewSessionModal() {
  const { isOpen, closeModal } = useNewSessionModal();
  const { collapsed } = useSidebar();
  const [mountKey, setMountKey] = useState(0);

  // 열릴 때마다 내부 컨텐츠를 새로 마운트 (상태 초기화)
  useEffect(() => {
    if (isOpen) setMountKey((k) => k + 1);
  }, [isOpen]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeModal]);

  // body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop (클릭 시 닫힘, 블러 없음) */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeModal}
      />

      {/* Floating Panel — 왼쪽에서 슬라이드, 사이드바 너비만큼 offset */}
      <div
        style={{ left: collapsed ? "3.5rem" : "15.5rem" }}
        className={`fixed top-4 bottom-4 z-50 w-160 max-w-[calc(100vw-4rem)] bg-white rounded-2xl shadow-2xl shadow-black/15 flex flex-col border border-slate-200/60 transition-all duration-300 ease-out overflow-hidden ${
          isOpen ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-4 pointer-events-none"
        }`}
      >
        {isOpen && <ModalContent key={mountKey} onClose={closeModal} />}
      </div>
    </>
  );
}
