import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TechBlogPost, TechBlogTrendSummary } from "@/lib/api/tech-blogs";
import { formatDate } from "../_lib/format";

export function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13 5.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.8V5.8H10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M6 4H4C3.45 4 3 4.45 3 5V12C3 12.55 3.45 13 4 13H11C11.55 13 12 12.55 12 12V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 3H13V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconSparkles({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.2 9.4L3.8 11L5.4 11.6L3.8 12.2L3.2 13.8L2.6 12.2L1 11.6L2.6 11L3.2 9.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
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

export function BlogCard({
  post,
  isDark,
  onToggleBookmark,
  onMarkRead,
}: {
  post: TechBlogPost;
  isDark: boolean;
  onToggleBookmark: (post: TechBlogPost) => void;
  onMarkRead: (post: TechBlogPost) => void;
}) {
  const tags = Array.from(new Set(post.tags)).slice(0, 4);
  const read = Boolean(post.readAt);

  return (
    <article className={`group flex h-full min-h-[14rem] flex-col rounded-md border p-4 transition-all hover:-translate-y-0.5 ${read ? "opacity-65" : ""} ${isDark ? read ? "border-white/5 bg-white/[0.025] hover:border-indigo-400/20" : "border-white/10 bg-white/5 hover:border-indigo-400/30" : read ? "border-slate-200 bg-slate-50 hover:border-indigo-100" : "border-slate-200 bg-white hover:border-indigo-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-2xs font-semibold ${isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"}`}>{post.sourceName}</span>
            <span className={`text-2xs ${isDark ? "text-white/35" : "text-slate-400"}`}>{formatDate(post.publishedAt)}</span>
            {read && <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-white/5 text-white/35" : "bg-slate-200 text-slate-500"}`}>읽음</span>}
          </div>
          <a href={post.url} target="_blank" rel="noreferrer" onClick={() => onMarkRead(post)} className={`line-clamp-2 text-base font-semibold leading-snug transition-colors ${isDark ? "text-white hover:text-indigo-300" : "text-slate-900 hover:text-indigo-600"}`}>
            {post.title}
          </a>
        </div>
        <button
          type="button"
          onClick={() => onToggleBookmark(post)}
          className={`shrink-0 rounded-md border p-2 transition ${post.bookmarked ? isDark ? "border-amber-300/30 bg-amber-400/15 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-600" : isDark ? "border-white/10 text-white/45 hover:bg-white/10 hover:text-white" : "border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"}`}
          aria-label={post.bookmarked ? "북마크 해제" : "북마크"}
        >
          <IconBookmark filled={post.bookmarked} />
        </button>
        {post.thumbnail && (
          <a href={post.url} target="_blank" rel="noreferrer" onClick={() => onMarkRead(post)} className="shrink-0">
            <img src={post.thumbnail} alt="" className={`h-16 w-20 rounded-md border object-cover ${isDark ? "border-white/10" : "border-slate-100"}`} />
          </a>
        )}
      </div>
      {post.summary && <p className={`mt-3 line-clamp-3 text-sm leading-6 ${isDark ? "text-white/50" : "text-slate-500"}`}>{post.summary}</p>}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => <span key={tag} className={`rounded-md border px-1.5 py-0.5 text-2xs ${isDark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-500"}`}>{tag}</span>)}
        </div>
      )}
      <div className="mt-auto flex items-center justify-end pt-4">
        <a href={post.url} target="_blank" rel="noreferrer" onClick={() => onMarkRead(post)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${isDark ? "bg-white/10 text-white hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}>
          열기 <IconExternal />
        </a>
      </div>
    </article>
  );
}

export function BlogSkeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`rounded-md border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className={`mb-3 h-4 w-20 animate-pulse rounded ${pulse}`} />
      <div className={`mb-2 h-5 w-4/5 animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-2/3 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-2.5 mt-4 text-base font-bold first:mt-0 sm:text-lg">{children}</h1>,
  h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-2 mt-3.5 text-sm font-bold first:mt-0 sm:text-base">{children}</h2>,
  h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{children}</h3>,
  p: ({ children }: { children?: ReactNode }) => <p className="my-2.5 text-sm leading-relaxed">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="my-2.5 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-bold">{children}</strong>,
};

export function TechBlogTrendPanel({
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
  trend: TechBlogTrendSummary | null;
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
                  <span className={`text-xs font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>AI 트렌드 분석 결과</span>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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
                AI 트렌드 분석
              </div>
              <div className={`truncate text-[11px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                {trend
                  ? "저장된 분석 결과가 있습니다. 펼쳐서 확인할 수 있습니다."
                  : "최근 2주 기술 블로그의 반복 키워드와 기업별 작성 흐름을 요약합니다."}
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
