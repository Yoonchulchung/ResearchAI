"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { getTopModels, type AiModelEntry } from "@/lib/api/ai-leaderboard";
import { getNewsFeed, type NewsItem } from "@/lib/api/news-feed";
import { listPapers, markPaperRead, type Paper } from "@/lib/api/papers";
import { listTechBlogPosts, markTechBlogRead, type TechBlogPost } from "@/lib/api/tech-blogs";
import PaperSummaryModal from "./_components/PaperSummaryModal";
import {
  HotPapersSection,
  ModelRankingSection,
  NewsFeedSection,
  TechBlogsSection,
} from "./_components/home-sections";
import {
  MobileFeaturedCard,
} from "./_components/list-items";
import {
  IconCode,
  IconEconomy,
  IconFeed,
  IconGlobe,
  IconHugging,
  IconNewspaper,
  IconPaper,
  IconScience,
  IconSearch,
  IconTrophy,
} from "./_components/icons";
import {
  cleanSearchKeyword,
  findTechBlogSourceId,
  inferFeedCategory,
  normalizeSearchText,
  type FeedCategory,
} from "./_lib/news-search";

export default function NewsPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [showMobileSearch, setShowMobileSearch] = useState(false);

  const [blogs, setBlogs] = useState<TechBlogPost[]>([]);
  const [blogLoading, setBlogLoading] = useState(true);
  const [blogError, setBlogError] = useState<string | null>(null);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperLoading, setPaperLoading] = useState(true);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [summaryPaper, setSummaryPaper] = useState<Paper | null>(null);

  const [models, setModels] = useState<AiModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [feedCategory, setFeedCategory] = useState<FeedCategory>("it");
  const [feedItems, setFeedItems] = useState<NewsItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [newsSearch, setNewsSearch] = useState("");

  const pageClass = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  const loadModels = useCallback(async () => {
    setModelsError(null);
    setModelsLoading(true);
    try {
      const result = await getTopModels(5);
      setModels(result);
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally { setModelsLoading(false); }
  }, []);

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
      const result = await listPapers({ limit: 50 });
      setPapers(result.papers);
    } catch (e) {
      setPaperError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally { setPaperLoading(false); }
  }, []);

  const handleMarkBlogRead = useCallback((post: TechBlogPost) => {
    if (post.readAt) return;
    const readAt = new Date().toISOString();
    setBlogs((prev) => prev.map((item) => item.id === post.id ? { ...item, readAt } : item));
    markTechBlogRead(post.id).then((updated) => {
      setBlogs((prev) => prev.map((item) => item.id === post.id ? updated : item));
    }).catch(() => {
      setBlogs((prev) => prev.map((item) => item.id === post.id ? { ...item, readAt: undefined } : item));
    });
  }, []);

  const handleMarkPaperRead = useCallback((paper: Paper) => {
    if (paper.readAt) return;
    const readAt = new Date().toISOString();
    setPapers((prev) => prev.map((item) => item.id === paper.id ? { ...item, readAt } : item));
    markPaperRead(paper.id).then((updated) => {
      setPapers((prev) => prev.map((item) => item.id === paper.id ? updated : item));
      setSummaryPaper((prev) => prev?.id === paper.id ? updated : prev);
    }).catch(() => {
      setPapers((prev) => prev.map((item) => item.id === paper.id ? { ...item, readAt: undefined } : item));
    });
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

  useEffect(() => { loadModels(); }, [loadModels]);
  useEffect(() => { loadBlogs(); }, [loadBlogs]);
  useEffect(() => { loadPapers(); }, [loadPapers]);
  useEffect(() => { loadFeed(feedCategory); }, [loadFeed, feedCategory]);

  const handleNewsSearch = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = newsSearch.trim();
    if (!query) return;

    const normalized = normalizeSearchText(query);
    const keyword = cleanSearchKeyword(query);
    const params = new URLSearchParams();

    if (normalized.includes("논문") || normalized.includes("paper") || normalized.includes("papers")) {
      if (keyword) params.set("q", keyword);
      router.push(`/news/papers${params.toString() ? `?${params.toString()}` : ""}`);
      return;
    }

    const sourceId = findTechBlogSourceId(query);
    if (
      sourceId ||
      normalized.includes("기술 블로그") ||
      normalized.includes("기술블로그") ||
      normalized.includes("tech blog") ||
      normalized.includes("engineering blog") ||
      normalized.includes("블로그")
    ) {
      if (sourceId) params.set("source", sourceId);
      else if (keyword) params.set("q", keyword);
      router.push(`/news/tech-blogs${params.toString() ? `?${params.toString()}` : ""}`);
      return;
    }

    const category = inferFeedCategory(query);
    params.set("category", category);
    if (keyword) params.set("q", keyword);
    router.push(`/news/feed?${params.toString()}`);
  }, [newsSearch, router]);

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      {summaryPaper && <PaperSummaryModal paper={summaryPaper} isDark={isDark} onClose={() => setSummaryPaper(null)} />}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* ===== Mobile header (compact) ===== */}
        <div className="md:hidden flex flex-col gap-4">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold tracking-tight ${textMain}`}>뉴스</h1>
            <button
              onClick={() => setShowMobileSearch((s) => !s)}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition ${isDark ? "bg-white/5 text-white/60 hover:bg-white/10" : "bg-slate-100 text-slate-500 hover:bg-slate-200"} ${showMobileSearch ? isDark ? "bg-white/10 text-indigo-300" : "bg-indigo-50 text-indigo-600" : ""}`}
              aria-label="검색"
            >
              <IconSearch />
            </button>
          </div>

          {/* Collapsible search */}
          <div className={`overflow-hidden transition-all duration-200 ease-out ${showMobileSearch ? "max-h-14" : "max-h-0"}`}>
            <form onSubmit={handleNewsSearch} className="flex gap-2">
              <input
                value={newsSearch}
                onChange={(e) => setNewsSearch(e.target.value)}
                placeholder='블로그, 논문, 뉴스 검색...'
                className={`flex-1 rounded-md border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-200/50 ${isDark ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50" : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-indigo-300"}`}
              />
              <button
                type="submit"
                className={`shrink-0 rounded-md px-4 py-2.5 text-sm font-semibold transition ${isDark ? "bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}
              >
                찾기
              </button>
            </form>
          </div>

          {/* Featured card */}
          {!blogLoading && blogs.length > 0 && (
            <MobileFeaturedCard post={blogs[0]} isDark={isDark} onRead={() => handleMarkBlogRead(blogs[0])} />
          )}
          {blogLoading && (
            <div className="overflow-hidden rounded-md">
              <div className={`h-36 w-full animate-pulse ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
              <div className={`flex items-center gap-3 px-5 py-3 ${isDark ? "border border-t-0 border-white/10 bg-slate-900/80" : "border border-t-0 border-slate-200 bg-white"} rounded-b-md`}>
                <div className={`h-3 w-2/3 animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-100"}`} />
              </div>
            </div>
          )}

          {/* Category shortcut icons */}
          <div className="-mx-4 px-4">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-0.5">
              {[
                { icon: <IconFeed />, label: "기술\n블로그", href: "/news/tech-blogs", bg: isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600" },
                { icon: <IconPaper />, label: "핫한\n논문", href: "/news/papers", bg: isDark ? "bg-blue-500/15 text-blue-300" : "bg-blue-50 text-blue-600" },
                { icon: <IconTrophy />, label: "AI\n랭킹", href: "/news/leaderboard", bg: isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-600" },
                { icon: <IconNewspaper />, label: "IT\n뉴스", href: "/news/feed?category=it", bg: isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-600" },
                { icon: <IconEconomy />, label: "경제", href: "/news/feed?category=economy", bg: isDark ? "bg-orange-500/15 text-orange-300" : "bg-orange-50 text-orange-600" },
                { icon: <IconScience />, label: "과학", href: "/news/feed?category=science", bg: isDark ? "bg-teal-500/15 text-teal-300" : "bg-teal-50 text-teal-600" },
                { icon: <IconGlobe />, label: "세계", href: "/news/feed?category=world", bg: isDark ? "bg-sky-500/15 text-sky-300" : "bg-sky-50 text-sky-600" },
                { icon: <IconCode />, label: "GitHub", href: "/news/feed?category=github", bg: isDark ? "bg-slate-500/20 text-slate-300" : "bg-slate-100 text-slate-700" },
                { icon: <IconHugging />, label: "HuggingFace", href: "/news/feed?category=huggingface", bg: isDark ? "bg-yellow-500/15 text-yellow-300" : "bg-yellow-50 text-yellow-600" },
              ].map((s) => (
                <Link key={s.label} href={s.href} className="flex shrink-0 flex-col items-center gap-1.5">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-md ${s.bg}`}>
                    {s.icon}
                  </div>
                  <span className={`whitespace-pre-line text-center text-2xs font-medium leading-tight ${isDark ? "text-white/55" : "text-slate-600"}`}>{s.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ===== Desktop header (full search panel) ===== */}
        <section className={`hidden md:block rounded-md border p-5 ${panelClass}`}>
          <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>뉴스</h1>
          <p className={`mt-1.5 text-sm ${textSub}`}>국내외 기술 블로그, 핫한 논문, 뉴스 피드를 한 곳에서 모아봅니다.</p>
          <form onSubmit={handleNewsSearch} className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <input
              value={newsSearch}
              onChange={(e) => setNewsSearch(e.target.value)}
              placeholder='예: "네이버 기술 블로그", "AI 논문"'
              className={`min-h-12 w-full min-w-0 flex-1 rounded-md border px-4 py-3 text-base leading-6 outline-none transition focus:ring-2 focus:ring-indigo-200/50 sm:min-h-11 sm:py-2.5 sm:text-sm ${isDark ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50" : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-indigo-300"}`}
            />
            <button
              type="submit"
              className={`min-h-12 w-full rounded-md px-5 py-3 text-base font-semibold leading-6 transition sm:min-h-11 sm:w-auto sm:py-2.5 sm:text-sm ${isDark ? "bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}
            >
              찾아보기
            </button>
          </form>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <TechBlogsSection
            blogs={blogs}
            loading={blogLoading}
            error={blogError}
            isDark={isDark}
            panelClass={panelClass}
            textMain={textMain}
            textSub={textSub}
            onMarkRead={handleMarkBlogRead}
            onViewAll={() => router.push("/news/tech-blogs")}
          />
          <HotPapersSection
            papers={papers}
            loading={paperLoading}
            error={paperError}
            isDark={isDark}
            panelClass={panelClass}
            textMain={textMain}
            textSub={textSub}
            onOpenSummary={setSummaryPaper}
            onMarkRead={handleMarkPaperRead}
            onViewAll={() => router.push("/news/papers")}
          />
        </div>

        <ModelRankingSection
          models={models}
          loading={modelsLoading}
          error={modelsError}
          isDark={isDark}
          panelClass={panelClass}
          textMain={textMain}
          textSub={textSub}
          onViewAll={() => router.push("/news/leaderboard")}
          onModelClick={(model) => router.push(`/news/leaderboard/${encodeURIComponent(model.id)}`)}
        />

        <NewsFeedSection
          feedItems={feedItems}
          loading={feedLoading}
          error={feedError}
          feedCategory={feedCategory}
          isDark={isDark}
          panelClass={panelClass}
          textMain={textMain}
          textSub={textSub}
          onCategoryChange={setFeedCategory}
          onViewAll={() => router.push("/news/feed")}
        />
      </div>
    </main>
  );
}
