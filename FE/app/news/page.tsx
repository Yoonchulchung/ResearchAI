"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { listTechBlogPosts, type TechBlogPost } from "@/lib/api/tech-blogs";
import { listHotPapers, type HotPaper } from "@/lib/api/hot-papers";
import { getNewsFeed, type NewsItem } from "@/lib/api/news-feed";

function IconFeed() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="4.5" cy="13.5" r="1.4" fill="currentColor" />
      <path d="M3.5 8.5C6.8 8.5 9.5 11.2 9.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 4C9.3 4 14 8.7 14 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPaper() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M5 2.5H10.5L14 6V15C14 15.55 13.55 16 13 16H5C4.45 16 4 15.55 4 15V3.5C4 2.95 4.45 2.5 5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10.5 2.5V6H14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 9H11.5M6.5 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconNewspaper() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7H13M5 10H10M5 13H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return `${diff}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

function BlogListItem({ post, isDark, border }: { post: TechBlogPost; isDark: boolean; border: boolean }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noreferrer"
      className={`group block px-4 py-3 transition-colors ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-xs font-semibold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>{post.sourceName}</span>
        <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(post.publishedAt)}</span>
      </div>
      <p className={`line-clamp-1 text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-indigo-300" : "text-slate-900 group-hover:text-indigo-600"}`}>
        {post.title}
      </p>
      {post.summary && (
        <p className={`mt-0.5 line-clamp-1 text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{post.summary}</p>
      )}
    </a>
  );
}

function PaperListItem({ paper, isDark, border }: { paper: HotPaper; isDark: boolean; border: boolean }) {
  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noreferrer"
      className={`group block px-4 py-3 transition-colors ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-xs font-semibold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>{paper.sourceName}</span>
        {typeof paper.upvotes === "number" && (
          <span className={`text-xs font-semibold ${isDark ? "text-amber-400" : "text-amber-600"}`}>▲ {paper.upvotes}</span>
        )}
        {paper.publishedAt && <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(paper.publishedAt)}</span>}
      </div>
      <p className={`line-clamp-1 text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-indigo-300" : "text-slate-900 group-hover:text-indigo-600"}`}>
        {paper.title}
      </p>
      {paper.summary && (
        <p className={`mt-0.5 line-clamp-1 text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{paper.summary}</p>
      )}
    </a>
  );
}

function NewsListItem({ item, isDark, border }: { item: NewsItem; isDark: boolean; border: boolean }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className={`group block px-4 py-3 transition-colors ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-xs font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{item.source}</span>
        {item.pubDate && <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(item.pubDate)}</span>}
      </div>
      <p className={`line-clamp-1 text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-emerald-300" : "text-slate-900 group-hover:text-emerald-600"}`}>
        {stripHtml(item.title)}
      </p>
      {item.description && (
        <p className={`mt-0.5 line-clamp-1 text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{stripHtml(item.description)}</p>
      )}
    </a>
  );
}

function SkeletonRow({ isDark, border }: { isDark: boolean; border: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div className={`px-4 py-3 ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""}`}>
      <div className={`mb-1.5 h-3 w-20 animate-pulse rounded ${pulse}`} />
      <div className={`h-4 w-5/6 animate-pulse rounded ${pulse}`} />
    </div>
  );
}

const FEED_CATEGORIES = [
  { id: "it", label: "IT" },
  { id: "economy", label: "경제" },
  { id: "science", label: "과학" },
  { id: "world", label: "세계" },
  { id: "github", label: "GitHub" },
  { id: "huggingface", label: "Hugging Face" },
] as const;

type FeedCategory = typeof FEED_CATEGORIES[number]["id"];

export default function NewsPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [blogs, setBlogs] = useState<TechBlogPost[]>([]);
  const [blogLoading, setBlogLoading] = useState(true);
  const [blogError, setBlogError] = useState<string | null>(null);

  const [papers, setPapers] = useState<HotPaper[]>([]);
  const [paperLoading, setPaperLoading] = useState(true);
  const [paperError, setPaperError] = useState<string | null>(null);

  const [feedCategory, setFeedCategory] = useState<FeedCategory>("it");
  const [feedItems, setFeedItems] = useState<NewsItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const pageClass = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  const loadBlogs = useCallback(async () => {
    setBlogError(null);
    setBlogLoading(true);
    try {
      const result = await listTechBlogPosts({ limit: 50 });
      setBlogs(result.posts);
    } catch (e) {
      setBlogError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally { setBlogLoading(false); }
  }, []);

  const loadPapers = useCallback(async () => {
    setPaperError(null);
    setPaperLoading(true);
    try {
      const result = await listHotPapers({ limit: 50 });
      setPapers(result.papers);
    } catch (e) {
      setPaperError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally { setPaperLoading(false); }
  }, []);

  const loadFeed = useCallback(async (category: FeedCategory) => {
    setFeedError(null);
    setFeedLoading(true);
    try {
      const result = await getNewsFeed(category);
      setFeedItems(result);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally { setFeedLoading(false); }
  }, []);

  useEffect(() => { loadBlogs(); }, [loadBlogs]);
  useEffect(() => { loadPapers(); }, [loadPapers]);
  useEffect(() => { loadFeed(feedCategory); }, [loadFeed, feedCategory]);

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <section className={`rounded-2xl border p-5 shadow-sm ${panelClass}`}>
          <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>뉴스</h1>
          <p className={`mt-1.5 text-sm ${textSub}`}>국내외 기술 블로그, 핫한 논문, 뉴스 피드를 한 곳에서 모아봅니다.</p>
        </section>

        {/* Top row: tech blogs + hot papers */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* 기술 블로그 */}
          <section className={`flex flex-col rounded-2xl border shadow-sm ${panelClass}`}>
            <div className={`flex items-center justify-between px-4 py-3.5 ${isDark ? "border-b border-white/5" : "border-b border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <span className={isDark ? "text-indigo-400" : "text-indigo-600"}><IconFeed /></span>
                <span className={`font-bold ${textMain}`}>기술 블로그</span>
                {!blogLoading && <span className={`text-xs ${textSub}`}>{blogs.length}개</span>}
              </div>
              <button
                onClick={() => router.push("/news/tech-blogs")}
                className={`text-xs font-semibold transition-colors ${isDark ? "text-white/40 hover:text-indigo-400" : "text-slate-400 hover:text-indigo-600"}`}
              >
                전체 보기
              </button>
            </div>
            <div className="flex-1">
              {blogLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} isDark={isDark} border={i > 0} />)
              ) : blogError ? (
                <p className={`px-4 py-6 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{blogError}</p>
              ) : (
                blogs.slice(0, 10).map((post, i) => <BlogListItem key={post.id} post={post} isDark={isDark} border={i > 0} />)
              )}
            </div>
          </section>

          {/* 핫한 논문 */}
          <section className={`flex flex-col rounded-2xl border shadow-sm ${panelClass}`}>
            <div className={`flex items-center justify-between px-4 py-3.5 ${isDark ? "border-b border-white/5" : "border-b border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <span className={isDark ? "text-indigo-400" : "text-indigo-600"}><IconPaper /></span>
                <span className={`font-bold ${textMain}`}>핫한 논문</span>
                {!paperLoading && <span className={`text-xs ${textSub}`}>{papers.length}개</span>}
              </div>
              <button
                onClick={() => router.push("/news/papers")}
                className={`text-xs font-semibold transition-colors ${isDark ? "text-white/40 hover:text-indigo-400" : "text-slate-400 hover:text-indigo-600"}`}
              >
                전체 보기
              </button>
            </div>
            <div className="flex-1">
              {paperLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} isDark={isDark} border={i > 0} />)
              ) : paperError ? (
                <p className={`px-4 py-6 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{paperError}</p>
              ) : (
                papers.slice(0, 10).map((paper, i) => <PaperListItem key={paper.id} paper={paper} isDark={isDark} border={i > 0} />)
              )}
            </div>
          </section>
        </div>

        {/* Bottom: 뉴스 피드 */}
        <section className={`flex flex-col rounded-2xl border shadow-sm ${panelClass}`}>
          <div className={`flex items-center justify-between px-4 py-3.5 ${isDark ? "border-b border-white/5" : "border-b border-slate-100"}`}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className={isDark ? "text-emerald-400" : "text-emerald-600"}><IconNewspaper /></span>
                <span className={`font-bold ${textMain}`}>뉴스 피드</span>
                {!feedLoading && <span className={`text-xs ${textSub}`}>{feedItems.length}개</span>}
              </div>
              {/* Category tabs */}
              <div className="flex items-center gap-1">
                {FEED_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setFeedCategory(cat.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${feedCategory === cat.id ? isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700" : isDark ? "text-white/40 hover:text-white/70" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => router.push("/news/feed")}
              className={`text-xs font-semibold transition-colors ${isDark ? "text-white/40 hover:text-emerald-400" : "text-slate-400 hover:text-emerald-600"}`}
            >
              전체 보기
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {feedLoading ? (
              Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} isDark={isDark} border={i > 0} />)
            ) : feedError ? (
              <p className={`px-4 py-6 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{feedError}</p>
            ) : (
              feedItems.slice(0, 10).map((item, i) => (
                <NewsListItem key={`${item.link}-${i}`} item={item} isDark={isDark} border={i > 1 || (i === 1)} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
