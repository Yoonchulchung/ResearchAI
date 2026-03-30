"use client";

import { Suspense, useEffect, useState } from "react";
import { useEditor } from "./_hooks/useEditor";
import { useDocSave } from "./_hooks/useDocSave";
import { useAiAssist } from "./_hooks/useAiAssist";
import { useRag } from "./_hooks/useRag";
import { useResize } from "./_hooks/useResize";
import { AiPanel } from "./_components/AiPanel";
import { EditorPanel } from "./_components/EditorPanel";
import { ResizeDivider } from "./_components/ResizeDivider";
import { useTheme } from "@/contexts/ThemeContext";
import { enqueueCompanyProfile, streamCompanyProfile } from "@/lib/api/ai";

import { IconDownload } from "./_components/icons";

function DocWritePageInner() {
  const { uiStyle } = useTheme();
  const isGlass = uiStyle === "glass";

  const editor = useEditor();
  const [companyName, setCompanyName] = useState("");
  const docSave = useDocSave(editor.setContent, setCompanyName);
  const ai = useAiAssist(editor.setContent);
  const rag = useRag();
  const { splitRatio, containerRef, startResize, isDragging } = useResize();
  const [pendingImprovement, setPendingImprovement] = useState<{
    original: string;
    improved: string;
    start: number;
  } | null>(null);

  const [jobTitle, setJobTitle] = useState("");
  const [companyProfile, setCompanyProfile] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchCompanyProfile = async () => {
    if (!companyName.trim() || profileLoading) return;
    setProfileLoading(true);
    setCompanyProfile("");
    let accumulated = "";
    try {
      const { jobId } = await enqueueCompanyProfile(companyName, ai.model);
      await streamCompanyProfile(jobId, (event) => {
        if (event.type === "chunk") {
          accumulated += event.text;
          setCompanyProfile(accumulated);
        }
      });
    } catch {
      setCompanyProfile("인재상 조회에 실패했습니다.");
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!editor.content.trim() || docSave.saving) return;
        if (docSave.savedDocId) {
          docSave.handleSave(editor.content, companyName);
        } else {
          docSave.setSaveTitleInput("");
          docSave.setSaveModal(true);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor.content, docSave]);

  const handleRunAssist = (instruction: string, userLabel?: string, skipCompanyCtx?: boolean, actionKey?: string) => {
    const companyCtx = skipCompanyCtx ? "" : companyProfile
      ? `## 지원 기업 정보\n기업명: ${companyName}\n\n### 인재상\n${companyProfile}\n\n이 기업의 인재상을 반드시 고려하여 작업해주세요.\n\n---\n\n`
      : companyName.trim()
        ? `## 지원 기업\n기업명: ${companyName}\n\n---\n\n`
        : "";
    ai.runAssist(
      actionKey ? companyCtx : companyCtx + instruction,
      editor.content,
      editor.selectedText,
      rag.selectedExperiences,
      userLabel,
      actionKey,
    );
  };

  return (
    <div className={`h-full flex flex-col overflow-hidden ${isGlass ? "p-3 pr-4 pb-4 bg-transparent" : "bg-slate-100"}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl border border-white/20" : ""}`}>
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-3 px-5 py-2.5 shrink-0 transition-all ${isGlass ? "border-b border-white/20" : "bg-white border-b border-slate-200/60"}`}>
        <input
          value={docSave.savedDocTitle}
          onChange={(e) => docSave.setSavedDocTitle(e.target.value)}
          placeholder="제목 없음"
          className={`text-sm font-semibold !bg-transparent !border-0 focus:outline-none min-w-0 w-64 ${isGlass ? "text-white placeholder-white/40" : "text-slate-800 placeholder-slate-300"}`}
        />

        <div className="flex-1" />

        <button
          onClick={() => docSave.handleSave(editor.content, companyName)}
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
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all ${
            isGlass
              ? "text-white/80 border-white/20 hover:bg-white/10 hover:text-white hover:border-white/30"
              : "text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
          }`}
        >
          <IconDownload /> 내보내기
        </button>
      </div>


      {/* ── Context Menu ───────────────────────────────────────────────────── */}
      {editor.contextMenu && editor.selectedText && (
        <div
          style={{ top: editor.contextMenu.y, left: editor.contextMenu.x }}
          className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-30"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              handleRunAssist(
`선택된 글을 아래 항목별로 평가해줘.\n\n1. 문장 명확성 — 문장이 명확하고 이해하기 쉬운지\n2. 논리 구조 — 논리적 흐름과 일관성이 있는지\n3. 표현력 — 어휘 선택과 표현이 적절한지\n4. 구체적 스토리 — 추상적 주장에 그치지 않고 실제 경험·사례·에피소드가 구체적으로 드러나는지\n5. 직무 적합성 — ${jobTitle ? `지원 직무(${jobTitle})에 필요한 역량·경험이 잘 드러나는지` : "지원 직무에 필요한 역량·경험이 잘 드러나는지 (직무명을 입력하면 더 구체적으로 평가할 수 있습니다)"}\n\n각 항목에 대해 현재 수준을 간략히 평가하고, 개선이 필요한 부분은 구체적인 개선 방향을 제안해줘.`,
                "글 평가",
              );
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M2 6h6M2 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            글 평가
          </button>
          <button
            onClick={() => {
              const original = editor.selectedText;
              const start = editor.selectedRange?.start ?? 0;
              ai.runImprove(original, (improved) => {
                editor.replaceSelected(improved);
                setPendingImprovement({ original, improved, start });
              });
            }}
            disabled={ai.aiLoading}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h4M4 4l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 2a5 5 0 1 1 0 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            내용 개선
          </button>
        </div>
      )}


      {/* ── Split View ─────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`flex-1 flex min-h-0 overflow-hidden ${isDragging ? "select-none cursor-col-resize" : ""} ${isGlass ? "" : "bg-white"}`}
      >
        <div style={{ width: `${splitRatio * 100}%` }} className="flex flex-col min-h-0 overflow-hidden">
          <EditorPanel
            content={editor.content}
            setContent={editor.setContent}
            mode={editor.mode}
            textareaRef={editor.textareaRef}
            words={editor.words}
            chars={editor.chars}
            onTextareaSelect={editor.handleTextareaSelect}
            onContextMenu={editor.handleContextMenu}
            pendingImprovement={pendingImprovement}
            onAccept={() => setPendingImprovement(null)}
            onRevert={() => {
              const { original, improved, start } = pendingImprovement!;
              editor.setContent((prev) =>
                prev.slice(0, start) + original + prev.slice(start + improved.length),
              );
              setPendingImprovement(null);
            }}
            companyName={companyName}
            setCompanyName={setCompanyName}
            jobTitle={jobTitle}
            setJobTitle={setJobTitle}
            onFetchProfile={fetchCompanyProfile}
            profileLoading={profileLoading}
            highlightFlash={editor.highlightFlash}
          />
        </div>

        <ResizeDivider onMouseDown={startResize} isDragging={isDragging} />

        <div style={{ width: `${(1 - splitRatio) * 100}%` }} className="flex flex-col min-h-0 overflow-hidden">
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
            companyName={companyName}
            companyProfile={companyProfile}
            profileLoading={profileLoading}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

export default function DocWritePage() {
  return (
    <Suspense>
      <DocWritePageInner />
    </Suspense>
  );
}
