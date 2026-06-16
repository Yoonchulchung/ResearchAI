"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_CLASS } from "../_constants";
import { useTheme } from "@/contexts/ThemeContext";

// ─── Word-level diff ──────────────────────────────────────────────────────────

type DiffToken = { type: "unchanged" | "removed" | "added"; text: string };

function computeDiff(original: string, improved: string): DiffToken[] {
  const tokenize = (s: string) => s.match(/\S+|\s+/g) ?? [];
  const a = tokenize(original);
  const b = tokenize(improved);
  const m = a.length, n = b.length;

  // LCS DP table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // Backtrack
  const tokens: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      tokens.unshift({ type: "unchanged", text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokens.unshift({ type: "added", text: b[j - 1] });
      j--;
    } else {
      tokens.unshift({ type: "removed", text: a[i - 1] });
      i--;
    }
  }
  return tokens;
}

interface PendingImprovement {
  original: string;
  improved: string;
  start: number;
}

interface Props {
  content: string;
  setContent: (v: string) => void;
  mode: "edit" | "preview";
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  words: number;
  chars: number;
  onTextareaSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  pendingImprovement: PendingImprovement | null;
  onAccept: () => void;
  onRevert: () => void;
  companyName: string;
  setCompanyName: (v: string) => void;
  jobDescription: string;
  setJobDescription: (v: string) => void;
  onFetchProfile: () => void;
  profileLoading: boolean;
  highlightFlash?: boolean;
}

export function EditorPanel({
  content,
  setContent,
  mode,
  textareaRef,
  words,
  chars,
  onTextareaSelect,
  onContextMenu,
  pendingImprovement,
  onAccept,
  onRevert,
  companyName,
  setCompanyName,
  jobDescription,
  setJobDescription,
  onFetchProfile,
  profileLoading,
  highlightFlash,
}: Props) {
  const [jdExpanded, setJdExpanded] = useState(false);
  const { theme, uiStyle } = useTheme();
  const isGlass = uiStyle === "glass";
  const isDark = theme === "dark";

  const diffTokens = pendingImprovement
    ? computeDiff(pendingImprovement.original, pendingImprovement.improved)
    : null;
  const diffBefore = pendingImprovement ? content.slice(0, pendingImprovement.start) : "";
  const diffAfter = pendingImprovement
    ? content.slice(pendingImprovement.start + pendingImprovement.improved.length)
    : "";

  return (
    <div className={`flex-1 flex flex-col min-w-0 border-r overflow-hidden transition-colors ${isGlass ? `bg-transparent ${isDark ? "border-white/10" : "border-black/10"}` : `bg-white ${isDark ? "border-slate-700/50" : "border-slate-200/60"}`}`}>

      {/* Company name + Job Description */}
      <div className={`px-2.5 sm:px-4 py-2 border-b shrink-0 space-y-1.5 ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-100"}`}>
        {/* 1행: 기업명 + 버튼들 */}
        <div className="flex items-center gap-1.5">
          <span className={`text-sm shrink-0 ${isDark ? "text-white/60" : "text-slate-500"}`}>지원 기업</span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onFetchProfile(); }}
            placeholder="기업명 입력..."
            className={`flex-1 min-w-0 text-sm bg-transparent! border-0! focus:outline-none ${isDark ? "text-white placeholder-white/30" : "text-slate-700 placeholder-slate-400"}`}
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setJdExpanded((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                jobDescription.trim()
                  ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  : isDark ? "text-white/50 bg-white/5 hover:bg-white/10" : "text-slate-500 bg-slate-100 hover:bg-slate-200"
              }`}
            >
              {jdExpanded ? "▲" : "▼"} JD
            </button>
            <button
              onClick={onFetchProfile}
              disabled={!companyName.trim() || profileLoading}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium border rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                isGlass && isDark
                  ? "text-indigo-100 bg-white/10 border-white/20 hover:bg-white/20"
                  : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
              }`}
            >
              {profileLoading ? (
                <span className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              ) : (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1L6.2 4.2L9.5 5L6.2 5.8L5 9L3.8 5.8L0.5 5L3.8 4.2L5 1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
              )}
              인재상
            </button>
          </div>
        </div>

        {/* 2행: JD 텍스트영역 (펼침 시) */}
        {jdExpanded && (
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Job Description 전체 내용을 붙여넣으세요. 평가/개선 시 이 JD에 부합하는지를 핵심 기준으로 사용합니다."
            rows={6}
            className={`w-full text-sm border rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-1 ${
              isDark
                ? "bg-white/5 border-white/10 text-white placeholder-white/30 focus:ring-indigo-400 focus:border-indigo-400"
                : "bg-slate-50 border-slate-200 text-slate-700 placeholder-slate-400 focus:ring-indigo-300 focus:border-indigo-300"
            }`}
          />
        )}
      </div>

      {/* Word/char count */}
      <div className="flex justify-end px-2.5 sm:px-4 py-1 sm:py-1.5 shrink-0">
        <span suppressHydrationWarning className={`text-xs sm:text-sm ${isDark ? "text-white/40" : "text-slate-400"}`}>
          {words.toLocaleString()}단어 · {chars.toLocaleString()}자
        </span>
      </div>

      {/* Content area */}
      <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto ${isDark ? "text-white" : "text-slate-700"}`}>
        {mode === "edit" && diffTokens ? (
          // ── Inline diff view ──────────────────────────────────────────────
          <div className="flex-1 px-4 sm:px-8 py-4 sm:py-6 text-base sm:text-lg leading-relaxed sm:leading-loose whitespace-pre-wrap font-[inherit]">
            <span>{diffBefore}</span>

            {/* Original line: unchanged + removed */}
            {diffTokens.some((t) => t.type === "removed") && (
              <span>
                {diffTokens
                  .filter((t) => t.type !== "added")
                  .map((t, i) =>
                    t.type === "removed" ? (
                      <span key={i} className="bg-red-100 text-red-700 rounded-sm">{t.text}</span>
                    ) : (
                      <span key={i}>{t.text}</span>
                    ),
                  )}
                {"\n"}
              </span>
            )}

            {/* Improved line: unchanged + added */}
            {diffTokens.some((t) => t.type === "added") && (
              <span>
                {diffTokens
                  .filter((t) => t.type !== "removed")
                  .map((t, i) =>
                    t.type === "added" ? (
                      <span key={i} className="bg-emerald-100 text-emerald-800 rounded-sm">{t.text}</span>
                    ) : (
                      <span key={i}>{t.text}</span>
                    ),
                  )}
              </span>
            )}

            <span>{diffAfter}</span>

            {/* Accept / Revert */}
            <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
              <button
                onClick={onAccept}
                className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
              >
                적용
              </button>
              <button
                onClick={onRevert}
                className="px-2.5 py-0.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
              >
                되돌리기
              </button>
            </span>
          </div>
        ) : mode === "edit" ? (
          <div className="relative flex-1 flex flex-col min-h-0">
            {highlightFlash && (
              <div
                className="absolute inset-0 pointer-events-none rounded-none z-10"
                style={{
                  animation: "highlight-pulse 2.5s ease-out forwards",
                  boxShadow: "inset 0 0 0 3px #818cf8",
                }}
              />
            )}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onSelect={onTextareaSelect}
              onMouseUp={onTextareaSelect}
              onKeyUp={onTextareaSelect}
              onContextMenu={onContextMenu}
              placeholder="내용을 작성하세요..."
              className={`flex-1 w-full px-4 sm:px-8 pt-2 sm:pt-3 pb-4 sm:pb-6 text-base sm:text-lg font-sans leading-relaxed sm:leading-loose !bg-transparent !border-0 focus:outline-none resize-none ${isDark ? "text-white placeholder-white/30" : "text-slate-700 placeholder-slate-400"}`}
            />
          </div>
        ) : (
          <div className="px-4 sm:px-8 py-4 sm:py-6">
            <div className={`${PROSE_CLASS} ${isDark ? "prose-invert text-white" : ""}`}>
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className={`italic ${isDark ? "text-white/40" : "text-slate-400"}`}>내용이 없습니다</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
