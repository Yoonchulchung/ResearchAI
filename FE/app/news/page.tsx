"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

function IconSparkles() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.2 9.4L3.8 11L5.4 11.6L3.8 12.2L3.2 13.8L2.6 12.2L1 11.6L2.6 11L3.2 9.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
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

function PaperListItem({
  paper,
  isDark,
  border,
  onOpenSummary,
}: {
  paper: HotPaper;
  isDark: boolean;
  border: boolean;
  onOpenSummary: (paper: HotPaper) => void;
}) {
  return (
    <div className={`group px-4 py-3 transition-colors ${border ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""} ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-xs font-semibold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>{paper.sourceName}</span>
        {typeof paper.upvotes === "number" && (
          <span className={`text-xs font-semibold ${isDark ? "text-amber-400" : "text-amber-600"}`}>▲ {paper.upvotes}</span>
        )}
        {paper.publishedAt && <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{formatDate(paper.publishedAt)}</span>}
      </div>
      <a
        href={paper.url}
        target="_blank"
        rel="noreferrer"
        className={`line-clamp-1 text-sm font-semibold leading-snug transition-colors ${isDark ? "text-white group-hover:text-indigo-300" : "text-slate-900 group-hover:text-indigo-600"}`}
      >
        {paper.title}
      </a>
      {paper.summary && (
        <p className={`mt-0.5 line-clamp-1 text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{paper.summary}</p>
      )}
      {paper.aiSummary && (
        <button
          onClick={() => onOpenSummary(paper)}
          className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${isDark ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15" : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
        >
          <IconSparkles />
          AI 요약 보기
        </button>
      )}
    </div>
  );
}

function PaperSummaryModal({
  paper,
  isDark,
  onClose,
}: {
  paper: HotPaper;
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
      <pre className={`my-4 overflow-x-auto rounded-xl p-4 text-sm leading-6 ${isDark ? "bg-black/30 text-white/80" : "bg-slate-100 text-slate-700"}`}>
        {children}
      </pre>
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <section
        className={`flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`}
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
              className={`shrink-0 rounded-lg border px-2 py-1 text-sm font-bold transition ${isDark ? "border-white/10 text-white/70 hover:bg-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
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

const TECH_BLOG_SEARCH_SOURCES = [
  { id: "naver-place", keywords: ["네이버 플레이스", "naver place", "플레이스"] },
  { id: "naver-d2", keywords: ["네이버 d2", "naver d2", "네이버", "naver"] },
  { id: "kakao-tech", keywords: ["카카오 테크", "카카오 기술", "kakao tech", "카카오"] },
  { id: "kakaopay", keywords: ["카카오페이", "kakaopay", "kakao pay"] },
  { id: "banksalad", keywords: ["뱅크샐러드", "banksalad", "뱅샐"] },
  { id: "toss", keywords: ["토스", "toss"] },
  { id: "line", keywords: ["라인", "line"] },
  { id: "woowa", keywords: ["우아한형제들", "우아한", "배민", "woowa"] },
  { id: "daangn", keywords: ["당근", "당근마켓", "daangn"] },
  { id: "kurly", keywords: ["컬리", "마켓컬리", "kurly"] },
  { id: "hyundai-autoever", keywords: ["현대오토에버", "autoever", "오토에버"] },
  { id: "hyundai", keywords: ["현대자동차", "hyundai"] },
  { id: "google-developers", keywords: ["구글 개발자", "google developers", "google developer"] },
  { id: "google-ai", keywords: ["구글 ai", "google ai"] },
  { id: "github", keywords: ["깃허브", "github"] },
  { id: "openai", keywords: ["오픈ai", "openai"] },
  { id: "anthropic", keywords: ["앤트로픽", "anthropic"] },
  { id: "meta-ai", keywords: ["메타 ai", "meta ai"] },
  { id: "meta", keywords: ["메타", "meta"] },
  { id: "microsoft", keywords: ["마이크로소프트", "microsoft"] },
  { id: "aws-blog", keywords: ["aws", "아마존 aws"] },
  { id: "amazon-science", keywords: ["아마존 사이언스", "amazon science"] },
  { id: "netflix", keywords: ["넷플릭스", "netflix"] },
  { id: "spotify", keywords: ["스포티파이", "spotify"] },
  { id: "airbnb", keywords: ["에어비앤비", "airbnb"] },
] as const;

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findTechBlogSourceId(query: string): string | null {
  const normalized = normalizeSearchText(query);
  for (const source of TECH_BLOG_SEARCH_SOURCES) {
    if (source.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return source.id;
    }
  }
  return null;
}

function cleanSearchKeyword(query: string) {
  return query
    .replace(/기술\s*블로그/g, " ")
    .replace(/블로그/g, " ")
    .replace(/논문/g, " ")
    .replace(/뉴스/g, " ")
    .replace(/피드/g, " ")
    .replace(/찾아줘|찾아 줘|검색해줘|검색해 줘|검색|보여줘|보여 줘|알려줘|알려 줘/g, " ")
    .replace(/의|에\s*대한|관련|에서/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferFeedCategory(query: string): FeedCategory {
  const normalized = normalizeSearchText(query);
  if (normalized.includes("경제") || normalized.includes("주가") || normalized.includes("환율")) return "economy";
  if (normalized.includes("과학") || normalized.includes("science")) return "science";
  if (normalized.includes("세계") || normalized.includes("해외") || normalized.includes("world")) return "world";
  if (normalized.includes("github") || normalized.includes("깃허브")) return "github";
  if (normalized.includes("hugging") || normalized.includes("허깅페이스")) return "huggingface";
  return "it";
}

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
  const [summaryPaper, setSummaryPaper] = useState<HotPaper | null>(null);

  const [feedCategory, setFeedCategory] = useState<FeedCategory>("it");
  const [feedItems, setFeedItems] = useState<NewsItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [newsSearch, setNewsSearch] = useState("");

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
        {/* Header */}
        <section className={`rounded-2xl border p-5 shadow-sm ${panelClass}`}>
          <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>뉴스</h1>
          <p className={`mt-1.5 text-sm ${textSub}`}>국내외 기술 블로그, 핫한 논문, 뉴스 피드를 한 곳에서 모아봅니다.</p>
          <form onSubmit={handleNewsSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={newsSearch}
              onChange={(e) => setNewsSearch(e.target.value)}
              placeholder='예: "네이버의 기술 블로그 찾아줘", "AI 논문 찾아줘"'
              className={`h-11 flex-1 rounded-xl border px-4 text-sm outline-none transition focus:ring-2 focus:ring-indigo-200/50 ${isDark ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50" : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-indigo-300"}`}
            />
            <button
              type="submit"
              className={`h-11 rounded-xl px-4 text-sm font-semibold transition ${isDark ? "bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30" : "bg-slate-900 text-white hover:bg-indigo-600"}`}
            >
              찾아보기
            </button>
          </form>
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
                papers.slice(0, 10).map((paper, i) => <PaperListItem key={paper.id} paper={paper} isDark={isDark} border={i > 0} onOpenSummary={setSummaryPaper} />)
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
