import { useRef, useEffect, useState } from "react";

interface PipelineTerminalProps {
  logs: string[];
  progressStep: string | null;
}

interface TypingState {
  completedLines: string[];
  currentLine: string;
  charPos: number;
  lineIndex: number;
}

function LogLines({
  completedLines,
  currentLine,
  showCursor,
}: {
  completedLines: string[];
  currentLine: string;
  showCursor: boolean;
}) {
  return (
    <>
      {completedLines.map((line, i) => (
        <div key={i} className="flex gap-2 leading-5">
          <span className="text-slate-300 select-none shrink-0">›</span>
          <span>{line}</span>
        </div>
      ))}
      {(currentLine || showCursor) && (
        <div className="flex gap-2 leading-5">
          <span className="text-slate-300 select-none shrink-0">›</span>
          <span>
            {currentLine}
            <span className="inline-block w-0.5 h-3.25 bg-slate-400 ml-px align-middle animate-pulse" />
          </span>
        </div>
      )}
    </>
  );
}

export function PipelineTerminal({ logs, progressStep }: PipelineTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef(logs);
  const [expanded, setExpanded] = useState(false);

  const [state, setState] = useState<TypingState>({
    completedLines: [],
    currentLine: "",
    charPos: 0,
    lineIndex: 0,
  });

  useEffect(() => {
    logsRef.current = logs;
    if (logs.length === 0) {
      setState({ completedLines: [], currentLine: "", charPos: 0, lineIndex: 0 });
    }
  }, [logs]);

  // Typing interval — runs once, reads logs via ref
  useEffect(() => {
    const interval = setInterval(() => {
      const currentLogs = logsRef.current;

      setState((prev) => {
        if (prev.lineIndex >= currentLogs.length) return prev;

        // Pending chars → determines speed
        let pending = (currentLogs[prev.lineIndex]?.length ?? 0) - prev.charPos;
        for (let i = prev.lineIndex + 1; i < currentLogs.length; i++) {
          pending += currentLogs[i].length;
        }
        const charsPerTick =
          pending > 400 ? 16 : pending > 150 ? 8 : pending > 50 ? 4 : 1;

        let completed = [...prev.completedLines];
        let currentLine = prev.currentLine;
        let charPos = prev.charPos;
        let lineIndex = prev.lineIndex;
        let budget = charsPerTick;

        while (budget > 0 && lineIndex < currentLogs.length) {
          const target = currentLogs[lineIndex];
          const remaining = target.length - charPos;

          if (remaining <= budget) {
            completed.push(target);
            currentLine = "";
            charPos = 0;
            lineIndex++;
            budget -= remaining;
          } else {
            charPos += budget;
            currentLine = target.slice(0, charPos);
            budget = 0;
          }
        }

        return { completedLines: completed, currentLine, charPos, lineIndex };
      });
    }, 30);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll on each typing tick
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    const mel = modalScrollRef.current;
    if (mel) mel.scrollTop = mel.scrollHeight;
  }, [state]);

  // Close modal on Escape
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (logs.length === 0 && state.completedLines.length === 0) return null;

  const isTyping = state.lineIndex < logs.length;
  const showCursor = isTyping || !!progressStep;

  const header = (onExpand?: () => void, onCollapse?: () => void) => (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
      <span className="text-xs font-medium text-slate-400 tracking-wide">
        pipeline log
      </span>
      <div className="flex items-center gap-3">
        {progressStep && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {progressStep}
          </span>
        )}
        {onExpand && (
          <button
            onClick={onExpand}
            className="text-slate-300 hover:text-slate-500 transition-colors"
            title="전체 보기"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
            </svg>
          </button>
        )}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="text-slate-300 hover:text-slate-500 transition-colors"
            title="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 1v4H1M13 5H9V1M9 13v-4h4M1 9h4v4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Inline card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {header(() => setExpanded(true))}
        <div
          ref={scrollRef}
          className="px-4 py-3 font-mono text-xs text-slate-600 space-y-1 max-h-44 overflow-y-auto"
        >
          <LogLines
            completedLines={state.completedLines}
            currentLine={state.currentLine}
            showCursor={showCursor}
          />
        </div>
      </div>

      {/* Modal overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[80vh]">
            {header(undefined, () => setExpanded(false))}
            <div
              ref={modalScrollRef}
              className="px-5 py-4 font-mono text-xs text-slate-600 space-y-1 overflow-y-auto flex-1"
            >
              <LogLines
                completedLines={state.completedLines}
                currentLine={state.currentLine}
                showCursor={showCursor}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
