"use client";

import { useEditor } from "./_hooks/useEditor";
import { useDocSave } from "./_hooks/useDocSave";
import { useAiAssist } from "./_hooks/useAiAssist";
import { useRag } from "./_hooks/useRag";
import { AiPanel } from "./_components/AiPanel";
import { EditorPanel } from "./_components/EditorPanel";
import { SaveModal } from "./_components/SaveModal";
import { IconDownload, IconEdit, IconEye } from "./_components/icons";

export default function DocWritePage() {
  const editor = useEditor();
  const docSave = useDocSave(editor.setContent);
  const ai = useAiAssist(editor.setContent);
  const rag = useRag();

  const handleRunAssist = (instruction: string, userLabel?: string) => {
    ai.runAssist(
      instruction,
      editor.content,
      editor.selectedText,
      rag.selectedExperiences,
      userLabel,
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F4F5F7]">

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-slate-200/60 shrink-0">
        <div className="flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-slate-500">
            <path d="M4 2H12C12.55 2 13 2.45 13 3V13C13 13.55 12.55 14 12 14H4C3.45 14 3 13.55 3 13V3C3 2.45 3.45 2 4 2Z" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6 5H10M6 8H10M6 11H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-bold text-slate-800">문서 작성</span>
        </div>

        <div className="flex-1" />

        {/* Edit / Preview toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => editor.setMode("edit")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              editor.mode === "edit" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <IconEdit /> 편집
          </button>
          <button
            onClick={() => editor.setMode("preview")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              editor.mode === "preview" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <IconEye /> 미리보기
          </button>
        </div>

        {docSave.savedDocTitle && (
          <span className="text-xs text-slate-400 truncate max-w-40">{docSave.savedDocTitle}</span>
        )}

        <button
          onClick={() => {
            if (docSave.savedDocId) {
              docSave.handleSave(editor.content);
            } else {
              docSave.setSaveTitleInput("");
              docSave.setSaveModal(true);
            }
          }}
          disabled={!editor.content.trim() || docSave.saving}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            docSave.saveSuccess
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {docSave.saving ? (
            <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : docSave.saveSuccess ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2H8L10 4V10H2V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M4 2V5H8V2" stroke="currentColor" strokeWidth="1.3" />
              <rect x="3.5" y="7" width="5" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
          {docSave.saveSuccess ? "저장됨" : docSave.savedDocId ? "저장" : "저장하기"}
        </button>

        <button
          onClick={editor.handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <IconDownload /> 내보내기
        </button>
      </div>

      {/* ── Save Modal ─────────────────────────────────────────────────────── */}
      {docSave.saveModal && (
        <SaveModal
          saveTitleInput={docSave.saveTitleInput}
          setSaveTitleInput={docSave.setSaveTitleInput}
          saving={docSave.saving}
          onSave={(title) => docSave.handleSave(editor.content, title)}
          onClose={() => docSave.setSaveModal(false)}
        />
      )}

      {/* ── Split View ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <EditorPanel
          content={editor.content}
          setContent={editor.setContent}
          mode={editor.mode}
          textareaRef={editor.textareaRef}
          words={editor.words}
          chars={editor.chars}
          onTextareaSelect={editor.handleTextareaSelect}
          onContextMenu={editor.handleContextMenu}
          applyToolbar={editor.applyToolbar}
        />

        <AiPanel
          messages={ai.messages}
          streamingContent={ai.streamingContent}
          aiLoading={ai.aiLoading}
          aiError={ai.aiError}
          customPrompt={ai.customPrompt}
          setCustomPrompt={ai.setCustomPrompt}
          model={ai.model}
          setModel={ai.setModel}
          copiedId={ai.copiedId}
          messagesEndRef={ai.messagesEndRef}
          selectedText={editor.selectedText}
          content={editor.content}
          selectedExperiences={rag.selectedExperiences}
          onClearMessages={() => ai.setMessages([])}
          onRunAssist={handleRunAssist}
          onApplyResult={ai.applyResult}
          onCopyText={ai.copyText}
        />
      </div>
    </div>
  );
}
