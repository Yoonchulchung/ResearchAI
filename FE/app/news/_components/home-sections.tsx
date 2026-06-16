import type { AiModelEntry } from "@/lib/api/ai-leaderboard";
import type { NewsItem } from "@/lib/api/news-feed";
import type { Paper } from "@/lib/api/papers";
import type { TechBlogPost } from "@/lib/api/tech-blogs";
import { FEED_CATEGORIES, type FeedCategory } from "../_lib/news-search";
import { IconFeed, IconNewspaper, IconPaper, IconTrophy } from "./icons";
import {
  BlogListItem,
  ModelListItem,
  NewsListItem,
  PaperListItem,
  SkeletonRow,
} from "./list-items";

type SectionThemeProps = {
  isDark: boolean;
  panelClass: string;
  textMain: string;
  textSub: string;
};

export function TechBlogsSection({
  blogs,
  loading,
  error,
  onMarkRead,
  onViewAll,
  ...theme
}: SectionThemeProps & {
  blogs: TechBlogPost[];
  loading: boolean;
  error: string | null;
  onMarkRead: (post: TechBlogPost) => void;
  onViewAll: () => void;
}) {
  const { isDark, panelClass, textMain, textSub } = theme;

  return (
    <section className={`flex flex-col rounded-md border ${panelClass}`}>
      <div className={`flex items-center justify-between px-4 py-3.5 ${isDark ? "border-b border-white/5" : "border-b border-slate-100"}`}>
        <div className="flex items-center gap-2">
          <span className={isDark ? "text-indigo-400" : "text-indigo-600"}><IconFeed /></span>
          <span className={`font-bold ${textMain}`}>기술 블로그</span>
          {!loading && <span className={`text-xs ${textSub}`}>{blogs.length}개</span>}
        </div>
        <button
          onClick={onViewAll}
          className={`text-xs font-semibold transition-colors ${isDark ? "text-white/40 hover:text-indigo-400" : "text-slate-400 hover:text-indigo-600"}`}
        >
          전체 보기
        </button>
      </div>
      <div className={`md:max-h-88 md:overflow-y-auto ${isDark ? "md:divide-y md:divide-white/5" : "md:divide-y md:divide-slate-100"} max-md:flex max-md:gap-3 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:pb-1.5 max-md:px-4`}>
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="max-md:shrink-0 max-md:w-64 max-md:snap-start">
              <SkeletonRow isDark={isDark} border={false} />
            </div>
          ))
        ) : error ? (
          <p className={`px-4 py-6 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>
        ) : (
          blogs.map((post) => (
            <div key={post.id} className={`max-md:shrink-0 max-md:w-64 max-md:snap-start max-md:rounded-md max-md:overflow-hidden max-md:border ${isDark ? "max-md:border-white/10" : "max-md:border-slate-200"}`}>
              <BlogListItem
                post={post}
                isDark={isDark}
                border={false}
                onMarkRead={onMarkRead}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function HotPapersSection({
  papers,
  loading,
  error,
  onOpenSummary,
  onMarkRead,
  onViewAll,
  ...theme
}: SectionThemeProps & {
  papers: Paper[];
  loading: boolean;
  error: string | null;
  onOpenSummary: (paper: Paper) => void;
  onMarkRead: (paper: Paper) => void;
  onViewAll: () => void;
}) {
  const { isDark, panelClass, textMain, textSub } = theme;

  return (
    <section className={`flex flex-col rounded-md border ${panelClass}`}>
      <div className={`flex items-center justify-between px-4 py-3.5 ${isDark ? "border-b border-white/5" : "border-b border-slate-100"}`}>
        <div className="flex items-center gap-2">
          <span className={isDark ? "text-indigo-400" : "text-indigo-600"}><IconPaper /></span>
          <span className={`font-bold ${textMain}`}>핫한 논문</span>
          {!loading && <span className={`text-xs ${textSub}`}>{papers.length}개</span>}
        </div>
        <button
          onClick={onViewAll}
          className={`text-xs font-semibold transition-colors ${isDark ? "text-white/40 hover:text-indigo-400" : "text-slate-400 hover:text-indigo-600"}`}
        >
          전체 보기
        </button>
      </div>
      <div className={`md:max-h-88 md:overflow-y-auto ${isDark ? "md:divide-y md:divide-white/5" : "md:divide-y md:divide-slate-100"} max-md:flex max-md:gap-3 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:pb-1.5 max-md:px-4`}>
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="max-md:shrink-0 max-md:w-64 max-md:snap-start">
              <SkeletonRow isDark={isDark} border={false} />
            </div>
          ))
        ) : error ? (
          <p className={`px-4 py-6 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>
        ) : (
          papers.map((paper) => (
            <div key={paper.id} className={`max-md:shrink-0 max-md:w-64 max-md:snap-start max-md:rounded-md max-md:overflow-hidden max-md:border ${isDark ? "max-md:border-white/10" : "max-md:border-slate-200"}`}>
              <PaperListItem
                paper={paper}
                isDark={isDark}
                border={false}
                onOpenSummary={onOpenSummary}
                onMarkRead={onMarkRead}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function ModelRankingSection({
  models,
  loading,
  error,
  onViewAll,
  onModelClick,
  ...theme
}: SectionThemeProps & {
  models: AiModelEntry[];
  loading: boolean;
  error: string | null;
  onViewAll: () => void;
  onModelClick: (model: AiModelEntry) => void;
}) {
  const { isDark, panelClass, textMain, textSub } = theme;

  return (
    <section className={`flex flex-col rounded-md border ${panelClass}`}>
      <div className={`flex items-center justify-between px-4 py-3.5 ${isDark ? "border-b border-white/5" : "border-b border-slate-100"}`}>
        <div className="flex items-center gap-2">
          <span className={isDark ? "text-amber-400" : "text-amber-600"}><IconTrophy /></span>
          <span className={`font-bold ${textMain}`}>AI 모델 랭킹</span>
          <span className={`text-xs ${textSub}`}>HuggingFace Open LLM Leaderboard v2</span>
        </div>
        <button
          onClick={onViewAll}
          className={`text-xs font-semibold transition-colors ${isDark ? "text-white/40 hover:text-amber-400" : "text-slate-400 hover:text-amber-600"}`}
        >
          전체 보기
        </button>
      </div>
      <div className={`${isDark ? "md:divide-y md:divide-white/5" : "md:divide-y md:divide-slate-100"} max-md:flex max-md:gap-3 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:pb-1.5 max-md:px-4`}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="max-md:shrink-0 max-md:w-64 max-md:snap-start">
              <SkeletonRow isDark={isDark} border={false} />
            </div>
          ))
        ) : error ? (
          <p className={`px-4 py-6 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>
        ) : (
          models.map((model) => (
            <div key={model.id} className={`max-md:shrink-0 max-md:w-56 max-md:snap-start max-md:rounded-md max-md:overflow-hidden max-md:border ${isDark ? "max-md:border-white/10" : "max-md:border-slate-200"}`}>
              <ModelListItem
                model={model}
                isDark={isDark}
                border={false}
                onClick={() => onModelClick(model)}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function NewsFeedSection({
  feedItems,
  loading,
  error,
  feedCategory,
  onCategoryChange,
  onViewAll,
  ...theme
}: SectionThemeProps & {
  feedItems: NewsItem[];
  loading: boolean;
  error: string | null;
  feedCategory: FeedCategory;
  onCategoryChange: (category: FeedCategory) => void;
  onViewAll: () => void;
}) {
  const { isDark, panelClass, textMain, textSub } = theme;

  return (
    <section className={`flex flex-col rounded-md border ${panelClass}`}>
      <div className={`flex flex-col gap-3 px-4 py-3.5 ${isDark ? "border-b border-white/5" : "border-b border-slate-100"}`}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className={isDark ? "text-emerald-400" : "text-emerald-600"}><IconNewspaper /></span>
            <span className={`font-bold ${textMain} whitespace-nowrap`}>뉴스 피드</span>
            {!loading && <span className={`text-xs ${textSub} whitespace-nowrap`}>{feedItems.length}개</span>}
          </div>
          <button
            onClick={onViewAll}
            className={`text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${isDark ? "text-white/40 hover:text-emerald-400" : "text-slate-400 hover:text-emerald-600"}`}
          >
            전체 보기
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          {FEED_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                feedCategory === cat.id
                  ? isDark
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : isDark
                    ? "text-white/50 border border-transparent hover:text-white hover:bg-white/5"
                    : "text-slate-500 border border-transparent hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
      <div className="md:grid md:grid-cols-2 max-md:flex max-md:gap-3 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:pb-1.5 max-md:px-4">
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="max-md:shrink-0 max-md:w-64 max-md:snap-start">
              <SkeletonRow isDark={isDark} border={false} />
            </div>
          ))
        ) : error ? (
          <p className={`px-4 py-6 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>
        ) : (
          feedItems.slice(0, 10).map((item, i) => (
            <div key={`${item.link}-${i}`} className={`max-md:shrink-0 max-md:w-64 max-md:snap-start max-md:rounded-md max-md:overflow-hidden max-md:border ${isDark ? "max-md:border-white/10" : "max-md:border-slate-200"}`}>
              <NewsListItem item={item} isDark={isDark} border={i >= 2} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
