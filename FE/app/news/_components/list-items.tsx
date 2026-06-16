import { MODEL_TYPE_LABELS, type AiModelEntry } from "@/lib/api/ai-leaderboard";
import type { NewsItem } from "@/lib/api/news-feed";
import type { Paper } from "@/lib/api/papers";
import type { TechBlogPost } from "@/lib/api/tech-blogs";
import { formatDate, stripHtml } from "../_lib/format";
import { IconBookmark, IconSparkles } from "./icons";

export function ModelListItem({ model, isDark, border, onClick }: { model: AiModelEntry; isDark: boolean; border: boolean; onClick: () => void }) {
  const rankEmoji = model.rank <= 3 ? ["🥇", "🥈", "🥉"][model.rank - 1] : null;
  const typeColors: Record<string, string> = {
    chat: isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-700",
    pretrained: isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700",
    "fine-tuned": isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-700",
    merge: isDark ? "bg-purple-500/15 text-purple-300" : "bg-purple-50 text-purple-700",
  };
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
    >
      <span className={`w-7 shrink-0 text-center text-sm font-bold tabular-nums ${isDark ? "text-white/30" : "text-slate-400"}`}>
        {rankEmoji ?? `#${model.rank}`}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-indigo-300" : "text-slate-900 group-hover:text-indigo-600"}`}>
            {model.modelName}
          </span>
          {model.modelType && (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold ${typeColors[model.modelType] ?? (isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-500")}`}>
              {MODEL_TYPE_LABELS[model.modelType] ?? model.modelType}
            </span>
          )}
        </div>
        <p className={`truncate text-xs ${isDark ? "text-white/35" : "text-slate-400"}`}>
          {model.org}{model.params != null ? ` · ${model.params >= 1 ? `${model.params.toFixed(0)}B` : `${(model.params * 1000).toFixed(0)}M`}` : ""}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
        {model.average?.toFixed(2) ?? "—"}
      </span>
    </button>
  );
}

export function BlogListItem({
  post,
  isDark,
  border,
  onMarkRead,
}: {
  post: TechBlogPost;
  isDark: boolean;
  border: boolean;
  onMarkRead: (post: TechBlogPost) => void;
}) {
  const read = Boolean(post.readAt);
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noreferrer"
      onClick={() => onMarkRead(post)}
      className={`group flex h-full flex-col px-4 py-3 transition-colors ${read ? "opacity-60" : ""} ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`text-xs font-semibold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>{post.sourceName}</span>
        <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(post.publishedAt)}</span>
        {post.bookmarked && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-amber-400/10 text-amber-300" : "bg-amber-50 text-amber-600"}`}>
            <IconBookmark filled />
            북마크
          </span>
        )}
        {read && <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-white/5 text-white/35" : "bg-slate-100 text-slate-400"}`}>읽음</span>}
      </div>
      <p className={`line-clamp-2 text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-indigo-300" : "text-slate-900 group-hover:text-indigo-600"}`}>
        {post.title}
      </p>
      {post.summary && (
        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${isDark ? "text-white/40" : "text-slate-400"}`}>{post.summary}</p>
      )}
    </a>
  );
}

export function PaperListItem({
  paper,
  isDark,
  border,
  onOpenSummary,
  onMarkRead,
}: {
  paper: Paper;
  isDark: boolean;
  border: boolean;
  onOpenSummary: (paper: Paper) => void;
  onMarkRead: (paper: Paper) => void;
}) {
  const read = Boolean(paper.readAt);
  return (
    <div className={`group flex h-full flex-col px-4 py-3 transition-colors ${read ? "opacity-60" : ""} ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`text-xs font-semibold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>{paper.sourceName}</span>
        {typeof paper.upvotes === "number" && (
          <span className={`text-xs font-semibold ${isDark ? "text-amber-400" : "text-amber-600"}`}>▲ {paper.upvotes}</span>
        )}
        {paper.publishedAt && <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(paper.publishedAt)}</span>}
        {paper.bookmarked && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-amber-400/10 text-amber-300" : "bg-amber-50 text-amber-600"}`}>
            <IconBookmark filled />
            북마크
          </span>
        )}
        {read && <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${isDark ? "bg-white/5 text-white/35" : "bg-slate-100 text-slate-400"}`}>읽음</span>}
      </div>
      <a
        href={paper.url}
        target="_blank"
        rel="noreferrer"
        onClick={() => onMarkRead(paper)}
        className={`line-clamp-2 text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-indigo-300" : "text-slate-900 group-hover:text-indigo-600"}`}
      >
        {paper.title}
      </a>
      {paper.summary && (
        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${isDark ? "text-white/40" : "text-slate-400"}`}>{paper.summary}</p>
      )}
      {paper.aiSummary && (
        <button
          onClick={() => onOpenSummary(paper)}
          className={`mt-auto pt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition ${isDark ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15" : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
        >
          <IconSparkles />
          AI 요약 보기
        </button>
      )}
    </div>
  );
}

export function NewsListItem({ item, isDark, border }: { item: NewsItem; isDark: boolean; border: boolean }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className={`group flex h-full flex-col px-4 py-3 transition-colors ${border ? isDark ? "md:border-t md:border-white/5" : "md:border-t md:border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`text-xs font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{item.source}</span>
        {item.pubDate && <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(item.pubDate)}</span>}
      </div>
      <p className={`line-clamp-2 text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-emerald-300" : "text-slate-900 group-hover:text-emerald-600"}`}>
        {stripHtml(item.title)}
      </p>
      {item.description && (
        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${isDark ? "text-white/40" : "text-slate-400"}`}>{stripHtml(item.description)}</p>
      )}
    </a>
  );
}

export function SkeletonRow({ isDark, border }: { isDark: boolean; border: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`px-4 py-3 ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""}`}>
      <div className={`mb-1.5 h-3 w-20 animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-5/6 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

const BLOG_GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-blue-500 to-indigo-600",
  "from-teal-500 to-emerald-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
  "from-purple-500 to-indigo-600",
];

export function MobileFeaturedCard({ post, isDark, onRead }: { post: TechBlogPost; isDark: boolean; onRead: () => void }) {
  const grad = BLOG_GRADIENTS[(post.sourceName.charCodeAt(0) ?? 0) % BLOG_GRADIENTS.length];
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noreferrer"
      onClick={onRead}
      className={`block overflow-hidden rounded-md ${post.readAt ? "opacity-60" : ""}`}
    >
      <div className={`bg-linear-to-br ${grad} px-5 pb-6 pt-5`}>
        <span className="text-xs font-semibold text-white/70">#{post.sourceName}</span>
        <h2 className="mt-1 line-clamp-3 text-xl font-bold leading-snug text-white">
          {post.title}
        </h2>
      </div>
      <div className={`flex items-center gap-3 px-5 py-3 ${isDark ? "border border-t-0 border-white/10 bg-slate-900/80" : "border border-t-0 border-slate-200 bg-white"} rounded-b-md`}>
        {post.summary ? (
          <p className={`line-clamp-1 flex-1 text-xs ${isDark ? "text-white/40" : "text-slate-500"}`}>{post.summary}</p>
        ) : (
          <span className="flex-1" />
        )}
        {post.publishedAt && (
          <span className={`shrink-0 text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(post.publishedAt)}</span>
        )}
      </div>
    </a>
  );
}
