import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Paper, PaperTrendSummary } from "@/lib/api/papers";
import { formatDate } from "../_lib/format";

export function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSparkles({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.2 9.4L3.8 11L5.4 11.6L3.8 12.2L3.2 13.8L2.6 12.2L1 11.6L2.6 11L3.2 9.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBookmark({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"}>
      <path d="M4.5 2.5h7v11L8 11.2l-3.5 2.3v-11Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function PaperCard({
  paper,
  isDark,
  summarizing,
  onSummarize,
  onOpenSummary,
  onOpenReader,
  onToggleBookmark,
  onMarkRead,
}: {
  paper: Paper;
  isDark: boolean;
  summarizing: boolean;
  onSummarize: (paper: Paper, refresh?: boolean) => void;
  onOpenSummary: (paper: Paper) => void;
  onOpenReader: (paper: Paper) => void;
  onToggleBookmark: (paper: Paper) => void;
  onMarkRead: (paper: Paper) => void;
}) {
  const [abstractOpen, setAbstractOpen] = useState(false);
  const read = Boolean(paper.readAt);

  return (
    <article className={`flex h-full flex-col rounded-md border p-4 transition ${read ? "opacity-65" : ""} ${isDark ? read ? "border-white/5 bg-white/[0.025] hover:border-indigo-400/20" : "border-white/10 bg-white/5 hover:border-indigo-400/30" : read ? "border-slate-200 bg-slate-50 hover:border-indigo-100" : "border-slate-200 bg-white hover:border-indigo-200"}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-1 text-2xs font-semibold ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>{paper.sourceName}</span>
          {paper.venue && <span className={`text-2xs ${isDark ? "text-white/35" : "text-slate-400"}`}>{paper.venue}</span>}
          {paper.publishedAt && <span className={`text-2xs ${isDark ? "text-white/35" : "text-slate-400"}`}>{formatDate(paper.publishedAt)}</span>}
          {typeof paper.upvotes === "number" && <span className={`rounded-md px-2 py-1 text-2xs font-semibold ${isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-600"}`}>▲ {paper.upvotes}</span>}
          {read && <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-white/5 text-white/35" : "bg-slate-200 text-slate-500"}`}>읽음</span>}
        </div>
        <button
          type="button"
          onClick={() => onToggleBookmark(paper)}
          className={`shrink-0 rounded-md border p-2 transition ${paper.bookmarked ? isDark ? "border-amber-300/30 bg-amber-400/15 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-600" : isDark ? "border-white/10 text-white/45 hover:bg-white/10 hover:text-white" : "border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"}`}
          aria-label={paper.bookmarked ? "북마크 해제" : "북마크"}
        >
          <IconBookmark filled={paper.bookmarked} />
        </button>
      </div>
      <h2 className={`text-base font-semibold leading-snug ${isDark ? "text-white" : "text-slate-900"}`}>{paper.title}</h2>
      {paper.authors.length > 0 && (
        <p className={`mt-2 line-clamp-1 text-xs ${isDark ? "text-white/35" : "text-slate-400"}`}>
          {paper.authors.slice(0, 8).join(", ")}{paper.authors.length > 8 ? " 외" : ""}
        </p>
      )}
      {paper.summary && (
        <div className="mt-3">
          <p className={`${abstractOpen ? "" : "line-clamp-4"} whitespace-pre-line text-sm leading-6 ${isDark ? "text-white/55" : "text-slate-600"}`}>
            {paper.summary}
          </p>
          {paper.summary.length > 220 && (
            <button
              type="button"
              onClick={() => setAbstractOpen((open) => !open)}
              className={`mt-2 text-xs font-semibold transition ${isDark ? "text-indigo-300 hover:text-indigo-200" : "text-indigo-600 hover:text-indigo-700"}`}
            >
              {abstractOpen ? "초록 접기" : "초록 전체 보기"}
            </button>
          )}
        </div>
      )}
      {paper.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(new Set(paper.tags)).slice(0, 4).map((tag) => <span key={tag} className={`rounded-md border px-1.5 py-0.5 text-2xs ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-500"}`}>{tag}</span>)}
        </div>
      )}
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-4">
        <button
          onClick={() => paper.aiSummary ? onOpenSummary(paper) : onSummarize(paper)}
          disabled={summarizing}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${isDark ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15" : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
        >
          <IconSparkles spinning={summarizing} />
          {summarizing ? "요약 중..." : paper.aiSummary ? "AI 요약 보기" : "AI 요약"}
        </button>
        {paper.pdfUrl && (
          <button
            onClick={() => onOpenReader(paper)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${isDark ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4"/><path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            PDF 읽기
          </button>
        )}
        {paper.codeUrl && <a href={paper.codeUrl} target="_blank" rel="noreferrer" onClick={() => onMarkRead(paper)} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Code</a>}
        <a href={paper.url} target="_blank" rel="noreferrer" onClick={() => onMarkRead(paper)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>원문 보기</a>
      </div>
    </article>
  );
}

const summaryMarkdownComponents = (isDark: boolean) => ({
  h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-3 mt-6 text-lg font-bold leading-snug first:mt-0 sm:text-xl">{children}</h1>,
  h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-2.5 mt-5 text-base font-bold leading-snug first:mt-0 sm:text-lg">{children}</h2>,
  h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-2 mt-4 text-sm font-bold leading-snug first:mt-0 sm:text-base">{children}</h3>,
  p: ({ children }: { children?: ReactNode }) => <p className="my-3.5 text-sm sm:text-base leading-relaxed">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="my-3.5 list-disc space-y-2 pl-5 text-sm sm:text-base leading-relaxed">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="my-3.5 list-decimal space-y-2 pl-5 text-sm sm:text-base leading-relaxed">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-bold">{children}</strong>,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className={`my-3 border-l-4 pl-4 text-sm sm:text-base ${isDark ? "border-indigo-400/50 text-white/65" : "border-indigo-200 text-slate-600"}`}>
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className={`rounded px-1.5 py-0.5 text-[0.85em] ${isDark ? "bg-white/10 text-indigo-200" : "bg-slate-100 text-indigo-700"}`}>
      {children}
    </code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className={`my-3 overflow-x-auto rounded-md p-4 text-[11px] sm:text-xs leading-relaxed ${isDark ? "bg-black/30 text-white/80" : "bg-slate-100 text-slate-700"}`}>
      {children}
    </pre>
  ),
});

export function SummaryModal({
  paper,
  isDark,
  onClose,
  onRefresh,
  refreshing,
}: {
  paper: Paper;
  isDark: boolean;
  onClose: () => void;
  onRefresh: (paper: Paper) => void;
  refreshing: boolean;
}) {
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
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={summaryMarkdownComponents(isDark)}>
              {paper.aiSummary || "아직 AI 요약이 없습니다."}
            </ReactMarkdown>
          </div>
        </div>
        <footer className={`flex flex-wrap justify-end gap-2 border-t px-5 py-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <button
            onClick={() => onRefresh(paper)}
            disabled={refreshing}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${isDark ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15" : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
          >
            <IconSparkles spinning={refreshing} />
            {refreshing ? "재요약 중..." : "AI 재요약"}
          </button>
          <a
            href={paper.url}
            target="_blank"
            rel="noreferrer"
            className={`rounded-md px-3 py-2 text-xs font-semibold ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}
          >
            원문 보기
          </a>
        </footer>
      </section>
    </div>
  );
}

export function PaperSkeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`rounded-md border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className={`mb-3 h-4 w-24 animate-pulse rounded ${pulse}`} />
      <div className={`mb-2 h-5 w-5/6 animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-2/3 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

const trendMarkdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-2.5 mt-4 text-base font-bold first:mt-0 sm:text-lg">{children}</h1>,
  h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-2 mt-3.5 text-sm font-bold first:mt-0 sm:text-base">{children}</h2>,
  h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{children}</h3>,
  p: ({ children }: { children?: ReactNode }) => <p className="my-2.5 text-sm leading-relaxed">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="my-2.5 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-bold">{children}</strong>,
};

export function PaperTrendPanel({
  trendOpen,
  trendStreaming,
  trend,
  trendLoading,
  trendError,
  hideTrendPanel,
  isDark,
  onToggleOpen,
  onAnalyze,
}: {
  trendOpen: boolean;
  trendStreaming: string;
  trend: PaperTrendSummary | null;
  trendLoading: boolean;
  trendError: string | null;
  hideTrendPanel: boolean;
  isDark: boolean;
  onToggleOpen: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div className={`pointer-events-none fixed inset-x-0 bottom-20 sm:bottom-4 z-30 px-4 transition-all duration-200 ease-out sm:px-6 lg:px-8 ${
      hideTrendPanel ? "translate-y-[calc(100%+5rem)] opacity-0" : "translate-y-0 opacity-100"
    }`}>
      <div className="pointer-events-auto mx-auto w-full max-w-3xl">
        {trendOpen && (trendStreaming || (trend && !trendLoading) || trendError) && (
          <div className={`mb-2 max-h-[45vh] overflow-y-auto rounded-md border p-4 text-sm leading-7 backdrop-blur ${isDark ? "border-white/10 bg-slate-950/90 text-white/70" : "border-slate-200 bg-white/95 text-slate-700"}`}>
            {trendError ? (
              <p className={isDark ? "text-red-300" : "text-red-600"}>{trendError}</p>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <IconSparkles spinning={trendLoading} />
                  <span className={`text-xs font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>AI 연구 트렌드 분석</span>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={trendMarkdownComponents}>
                  {trendStreaming || trend?.summary || ""}
                </ReactMarkdown>
                {trendLoading && trendStreaming && (
                  <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-indigo-400 align-text-bottom" />
                )}
                {!trendLoading && (trend?.keywords ?? []).length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {trend!.keywords.map((kw) => (
                      <span key={kw.keyword} className={`rounded-md px-2 py-1 text-xs font-medium ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>
                        {kw.keyword}
                      </span>
                    ))}
                  </div>
                )}
                {!trendLoading && trend?.generatedAt && (
                  <div className={`mt-3 text-[11px] ${isDark ? "text-white/35" : "text-slate-400"}`}>
                    저장된 분석 · {new Date(trend.generatedAt).toLocaleString("ko-KR")}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div className={`rounded-md border px-3 py-2 backdrop-blur transition-colors ${isDark ? "border-slate-700/70 bg-[#0f172a]/95" : "border-slate-200 bg-slate-50/95"}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className={`truncate text-xs font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>
                AI 연구 트렌드 분석
              </div>
              <div className={`truncate text-[11px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                {trend
                  ? "저장된 분석 결과가 있습니다. 펼쳐서 확인할 수 있습니다."
                  : "현재 핫한 논문들의 연구 주제, 방법론 흐름을 AI가 요약합니다."}
              </div>
            </div>
            {(trend || trendError || trendStreaming) && (
              <button
                onClick={onToggleOpen}
                className={`h-9 shrink-0 rounded-md border px-3 text-xs font-semibold transition-colors ${isDark ? "border-white/10 text-white/70 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-white"}`}
              >
                {trendOpen ? "접기" : "펼치기"}
              </button>
            )}
            <button
              onClick={onAnalyze}
              disabled={trendLoading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-primary text-white shadow-brand-primary/30 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={trend ? "트렌드 재분석" : "AI 트렌드 분석"}
            >
              {trendLoading ? (
                <IconSparkles spinning />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
