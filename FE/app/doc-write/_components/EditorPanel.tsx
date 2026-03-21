"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_CLASS } from "../_constants";

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
}: Props) {
  const diffTokens = pendingImprovement
    ? computeDiff(pendingImprovement.original, pendingImprovement.improved)
    : null;
  const diffBefore = pendingImprovement ? content.slice(0, pendingImprovement.start) : "";
  const diffAfter = pendingImprovement
    ? content.slice(pendingImprovement.start + pendingImprovement.improved.length)
    : "";

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-slate-200/60 overflow-hidden">

      {/* Word/char count */}
      <div className="flex justify-end px-4 py-1.5 shrink-0">
        <span className="text-xs text-slate-300">
          {words.toLocaleString()}단어 · {chars.toLocaleString()}자
        </span>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {mode === "edit" && diffTokens ? (
          // ── Inline diff view ──────────────────────────────────────────────
          <div className="flex-1 px-8 py-6 text-base text-slate-700 leading-relaxed whitespace-pre-wrap font-[inherit]">
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
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onSelect={onTextareaSelect}
            onMouseUp={onTextareaSelect}
            onKeyUp={onTextareaSelect}
            onContextMenu={onContextMenu}
            placeholder="내용을 작성하세요..."
            className="flex-1 w-full px-8 py-6 text-base text-slate-700 leading-relaxed bg-transparent border-0 focus:outline-none resize-none placeholder-slate-300"
          />
        ) : (
          <div className="px-8 py-6">
            <div className={PROSE_CLASS}>
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="text-slate-300 italic">내용이 없습니다</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
