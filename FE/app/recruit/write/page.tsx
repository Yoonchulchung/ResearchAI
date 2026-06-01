"use client";

import { CSSProperties, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEditor } from "../_hooks/useEditor";
import { useDocSave } from "../_hooks/useDocSave";
import { useAiAssist } from "../_hooks/useAiAssist";
import { useRag } from "../_hooks/useRag";
import { useResize } from "../_hooks/useResize";
import { AiPanel } from "../_components/AiPanel";
import { EditorPanel } from "../_components/EditorPanel";
import { ResizeDivider } from "../_components/ResizeDivider";
import { useTheme } from "@/contexts/ThemeContext";
import { enqueueCompanyProfile, streamCompanyProfile } from "@/lib/api/ai";
import { PROSE_CLASS } from "../_constants";
import { IconDownload, IconImprove } from "../_components/icons";

function RecruitWritePageInner() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isGlass = uiStyle === "glass";
  const isDark = theme === "dark";

  const editor = useEditor();
  const [companyName, setCompanyName] = useState("");
  const docSave = useDocSave(editor.setContent, setCompanyName);
  const ai = useAiAssist(editor.setContent);
  const rag = useRag();
  const { splitRatio, containerRef, startResize, isDragging } = useResize(0.3);
  const [pendingImprovement, setPendingImprovement] = useState<{
    original: string;
    improved: string;
    start: number;
  } | null>(null);

  const [jobDescription, setJobDescription] = useState("");
  const [companyProfile, setCompanyProfile] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  const fetchCompanyProfile = async () => {
    if (!companyName.trim() || profileLoading) return;
    setProfileLoading(true);
    setCompanyProfile("");
    setProfileModalOpen(true);
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
  }, [companyName, editor.content, docSave]);

  const handleRunAssist = (instruction: string, userLabel?: string, skipCompanyCtx?: boolean, actionKey?: string) => {
    setAiPanelOpen(true);
    // 기업 정보 + Job Description 컨텍스트 조립 — JD 가 있으면 평가/개선의 핵심 기준으로 항상 첨부
    const parts: string[] = [];
    if (!skipCompanyCtx) {
      if (companyName.trim() || companyProfile) {
        parts.push(`## 지원 기업`);
        if (companyName.trim()) parts.push(`**기업명**: ${companyName}`);
        if (companyProfile) parts.push(`### 인재상\n${companyProfile}`);
      }
    }
    // JD 는 평가·개선의 핵심 기준 — skipCompanyCtx 와 무관하게 항상 포함
    if (jobDescription.trim()) {
      parts.push(`## 📌 Job Description (평가·개선의 핵심 기준)\n\`\`\`\n${jobDescription.trim()}\n\`\`\`\n\n**평가·개선 시 위 JD 에 본인 강점·경험·비전이 얼마나 부합하는지를 최우선 기준으로 판단하세요.**`);
    }
    const companyCtx = parts.length > 0 ? parts.join('\n\n') + '\n\n---\n\n' : '';
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
    <div className={`h-full flex flex-col overflow-hidden ${isGlass ? "p-1.5 sm:p-3 sm:pr-4 sm:pb-4 bg-transparent" : ""}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-xl sm:rounded-2xl shadow-xl border border-white/20" : ""}`}>
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div className={`shrink-0 transition-all ${isGlass ? `border-b ${isDark ? "border-white/20" : "border-black/10"}` : `bg-white border-b ${isDark ? "border-slate-700/50" : "border-slate-200/60"}`}`}>
        {/* Row 1: title + all nav buttons */}
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 sm:px-5">
          <input
            value={docSave.savedDocTitle}
            onChange={(e) => docSave.setSavedDocTitle(e.target.value)}
            placeholder="제목 없음"
            className={`hidden sm:block flex-1 min-w-0 text-base font-semibold !bg-transparent !border-0 focus:outline-none ${isDark ? "text-white placeholder-white/40" : "text-slate-800 placeholder-slate-400"}`}
          />
          <button
            onClick={() => router.push("/recruit/job-posting")}
            title="채용공고"
            className={`flex-1 sm:flex-none min-w-[5.5rem] sm:min-w-0 justify-center shrink-0 flex items-center gap-1 px-2 py-1.5 sm:py-1 text-xs font-medium rounded-md border transition-all ${
              isGlass && isDark
                ? "text-white/70 border-white/20 hover:bg-white/10 hover:text-white"
                : "text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            채용공고
          </button>
          <button
            onClick={() => router.push("/recruit/cover-letter")}
            title="참고 자소서"
            className={`flex-1 sm:flex-none min-w-[6rem] sm:min-w-0 justify-center shrink-0 flex items-center gap-1 px-2 py-1.5 sm:py-1 text-xs font-medium rounded-md border transition-all ${
              isGlass && isDark
                ? "text-white/70 border-white/20 hover:bg-white/10 hover:text-white"
                : "text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 1h8v10H2V1z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 4h4M4 6.5h4M4 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            참고 자소서
          </button>
          <button
            onClick={() => router.push("/companies")}
            title="기업 분석"
            className="flex-1 sm:flex-none min-w-[5.5rem] sm:min-w-0 justify-center shrink-0 flex items-center gap-1 px-2 py-1.5 sm:py-1 text-xs font-semibold rounded-md border transition-all bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 10V5M5 10V2M8 10V7M11 10V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            기업 분석
          </button>
          <button
            onClick={() => setAiPanelOpen((open) => !open)}
            title="AI 어시스턴트"
            aria-pressed={aiPanelOpen}
            className={`shrink-0 flex items-center justify-center gap-1 w-9 sm:w-auto sm:px-2 h-8 sm:h-7 rounded-md border text-xs font-semibold transition-all ${
              aiPanelOpen
                ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700"
                : isGlass && isDark
                  ? "text-white/70 border-white/20 hover:bg-white/10 hover:text-white"
                  : "text-slate-500 border-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200"
            }`}
          >
            <IconImprove />
            <span className="hidden sm:inline">AI</span>
          </button>
          {editor.content.trim() && (
            <button
              onClick={editor.handleExport}
              title="내보내기"
              className={`shrink-0 flex items-center justify-center w-9 sm:w-7 h-8 sm:h-7 rounded-md border transition-all ${
                isGlass && isDark
                  ? "text-white/70 border-white/20 hover:bg-white/10 hover:text-white"
                  : "text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              <IconDownload />
            </button>
          )}
        </div>
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
`선택된 글을 아래 항목별로 평가해줘.\n\n1. 문장 명확성 — 문장이 명확하고 이해하기 쉬운지\n2. 논리 구조 — 논리적 흐름과 일관성이 있는지\n3. 표현력 — 어휘 선택과 표현이 적절한지\n4. 구체적 스토리 — 추상적 주장에 그치지 않고 실제 경험·사례·에피소드가 구체적으로 드러나는지\n5. 직무 적합성 — ${jobDescription.trim() ? `위에 제시된 Job Description 의 요구사항에 본인 강점·경험이 부합하는지` : "지원 직무에 필요한 역량·경험이 잘 드러나는지 (Job Description 을 입력하면 더 구체적으로 평가할 수 있습니다)"}\n\n각 항목에 대해 현재 수준을 간략히 평가하고, 개선이 필요한 부분은 구체적인 개선 방향을 제안해줘.`,
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
        className={`flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden ${isDragging ? "select-none cursor-col-resize" : ""} ${isGlass ? "" : "bg-white"}`}
      >
        <div
          style={aiPanelOpen ? ({ "--split": `${splitRatio * 100}%` } as CSSProperties & Record<"--split", string>) : undefined}
          className={`${aiPanelOpen ? "w-full lg:w-(--split) flex-[1.15] lg:flex-none" : "w-full flex-1"} flex flex-col min-h-[38vh] lg:min-h-0 overflow-hidden`}
        >
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
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            onFetchProfile={fetchCompanyProfile}
            profileLoading={profileLoading}
            highlightFlash={editor.highlightFlash}
          />
        </div>

        {aiPanelOpen && (
          <div className="hidden lg:flex"><ResizeDivider onMouseDown={startResize} isDragging={isDragging} /></div>
        )}

        {aiPanelOpen && (
          <div
            style={{ "--split": `${(1 - splitRatio) * 100}%` } as CSSProperties & Record<"--split", string>}
            className={`fixed inset-0 z-50 flex flex-col min-h-0 overflow-hidden lg:static lg:inset-auto lg:z-auto lg:w-(--split) lg:flex-[0.85] lg:flex-none ${
              isDark ? "bg-slate-900" : "bg-white"
            }`}
          >
            <AiPanel
              messages={ai.messages}
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
              ragQuery={rag.ragQuery}
              setRagQuery={rag.setRagQuery}
              ragResults={rag.ragResults}
              ragLoading={rag.ragLoading}
              handleRagSearch={rag.handleRagSearch}
              toggleExperience={rag.toggleExperience}
              onClearMessages={() => ai.setMessages([])}
              onRunAssist={handleRunAssist}
              onApplyResult={ai.applyResult}
              onCopyText={ai.copyText}
              companyName={companyName}
              onClose={() => setAiPanelOpen(false)}
            />
          </div>
        )}
      </div>
      </div>

      {/* 인재상 팝업 모달 */}
      {profileModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setProfileModalOpen(false)}
        >
          <div
            className="w-full sm:max-w-xl max-h-[82dvh] sm:max-h-[70vh] rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 11 11" fill="none" className="text-indigo-500">
                  <path d="M5.5 1L6.7 4.2L10 5L6.7 5.8L5.5 9L4.3 5.8L1 5L4.3 4.2L5.5 1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">
                  {companyName} 인재상
                </span>
                {profileLoading && (
                  <span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                )}
              </div>
              <button
                onClick={() => setProfileModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!companyProfile && profileLoading ? (
                <div className="flex items-center justify-center h-32 gap-2 text-slate-400 text-sm">
                  <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  조회 중...
                </div>
              ) : (
                <div className={`${PROSE_CLASS} text-sm`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{companyProfile}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecruitWritePage() {
  return (
    <Suspense>
      <RecruitWritePageInner />
    </Suspense>
  );
}
