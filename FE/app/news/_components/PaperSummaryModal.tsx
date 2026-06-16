import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Paper } from "@/lib/api/papers";

export default function PaperSummaryModal({
  paper,
  isDark,
  onClose,
}: {
  paper: Paper;
  isDark: boolean;
  onClose: () => void;
}) {
  const markdownComponents = {
    h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-4 mt-7 text-2xl font-bold first:mt-0">{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-4 mt-7 text-xl font-bold first:mt-0">{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-3 mt-6 text-lg font-bold first:mt-0">{children}</h3>,
    p: ({ children }: { children?: ReactNode }) => <p className="my-5 text-lg leading-9 sm:text-xl sm:leading-10">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="my-5 list-disc space-y-2.5 pl-6 text-lg leading-9 sm:text-xl sm:leading-10">{children}</ul>,
    ol: ({ children }: { children?: ReactNode }) => <ol className="my-5 list-decimal space-y-2.5 pl-6 text-lg leading-9 sm:text-xl sm:leading-10">{children}</ol>,
    li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
    strong: ({ children }: { children?: ReactNode }) => <strong className="font-bold">{children}</strong>,
    code: ({ children }: { children?: ReactNode }) => (
      <code className={`rounded px-1.5 py-0.5 text-[0.9em] ${isDark ? "bg-white/10 text-indigo-200" : "bg-slate-100 text-indigo-700"}`}>
        {children}
      </code>
    ),
    pre: ({ children }: { children?: ReactNode }) => (
      <pre className={`my-4 overflow-x-auto rounded-md p-4 text-sm leading-6 ${isDark ? "bg-black/30 text-white/80" : "bg-slate-100 text-slate-700"}`}>
        {children}
      </pre>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <section
        className={`flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border ${isDark ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="논문 AI 요약"
      >
        <header className={`border-b px-5 py-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className={`mb-2 flex flex-wrap items-center gap-2 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                <span className={`rounded-md px-2 py-1 font-semibold ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>{paper.sourceName}</span>
                {paper.aiSummaryModel && <span>{paper.aiSummaryModel}</span>}
                {paper.aiSummaryAt && <span>{new Date(paper.aiSummaryAt).toLocaleString("ko-KR")}</span>}
              </div>
              <h2 className="line-clamp-2 text-lg font-bold leading-snug">{paper.title}</h2>
            </div>
            <button
              onClick={onClose}
              className={`shrink-0 rounded-md border px-2 py-1 text-sm font-bold transition ${isDark ? "border-white/10 text-white/70 hover:bg-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <div className={isDark ? "text-white/85" : "text-slate-900"}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {paper.aiSummary || "아직 AI 요약이 없습니다."}
            </ReactMarkdown>
          </div>
        </div>
      </section>
    </div>
  );
}
