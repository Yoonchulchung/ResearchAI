"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE, apiFetch } from "@/lib/api/base";
import { getGithubTrending, getHuggingFaceTrending } from "@/lib/api/news-feed";
import { useTheme } from "@/contexts/ThemeContext";

// ── Google News ──────────────────────────────────────────────
interface GoogleNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

interface NewsArticleSummary {
  id: string;
  url: string;
  title: string;
  source: string | null;
  description: string | null;
  summary: string;
  model: string | null;
  articleUrl: string | null;
  updatedAt: string;
}

const GOOGLE_NEWS_CATEGORIES = [
  { label: "IT/AI", value: "it" },
  { label: "경제", value: "economy" },
  { label: "사회", value: "society" },
  { label: "정치", value: "politics" },
  { label: "세계", value: "world" },
  { label: "문화", value: "culture" },
  { label: "과학", value: "science" },
] as const;
type GoogleNewsCategory = (typeof GOOGLE_NEWS_CATEGORIES)[number]["value"];

// ── GitHub Trending (via GitHub Search API) ──────────────────
interface GHRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
}

// ── Hugging Face Trending ────────────────────────────────────
interface HFItem {
  id: string;
  modelId?: string;
  likes: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
  lastModified?: string;
}

type HFCategory = "models" | "datasets" | "spaces";
const HF_CATEGORIES: { label: string; value: HFCategory }[] = [
  { label: "Models", value: "models" },
  { label: "Datasets", value: "datasets" },
  { label: "Spaces", value: "spaces" },
];

type Tab = "naver" | "github" | "hf";
const SINCE_OPTIONS = [
  { label: "오늘", value: "daily", days: 1 },
  { label: "이번 주", value: "weekly", days: 7 },
  { label: "이번 달", value: "monthly", days: 30 },
] as const;
type Since = (typeof SINCE_OPTIONS)[number]["value"];

// ── helpers ──────────────────────────────────────────────────
function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function langColor(lang: string | null): string {
  const map: Record<string, string> = {
    TypeScript: "bg-blue-400", JavaScript: "bg-yellow-400", Python: "bg-blue-500",
    Rust: "bg-orange-500", Go: "bg-cyan-500", Java: "bg-red-400", "C++": "bg-pink-500",
    C: "bg-gray-500", Swift: "bg-orange-400", Kotlin: "bg-purple-500",
  };
  return map[lang ?? ""] ?? "bg-slate-400";
}

// ── Skeleton ─────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-2.5 pt-1">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
          <div className="h-2.5 bg-slate-100 rounded animate-pulse w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ── News Modal ────────────────────────────────────────────────
function NewsModal({ item, onClose, onSummaryCreated }: { item: GoogleNewsItem; onClose: () => void; onSummaryCreated?: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [content, setContent] = useState("");
  const [image, setImage] = useState("");
  const [articleUrl, setArticleUrl] = useState(item.link);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summaryStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setFetchLoading(true);
    setFetchFailed(false);
    setContent("");
    setImage("");
    setArticleUrl(item.link);
    setSummary("");
    setSummaryError("");
    setSummaryOpen(false);
    summaryStreamRef.current?.();
    summaryStreamRef.current = null;
    apiFetch<NewsArticleSummary | null>(`/news/article-summary?url=${encodeURIComponent(item.link)}`)
      .then((saved) => {
        if (saved?.summary) setSummary(saved.summary);
      })
      .catch(() => {});
    fetch(`${API_BASE}/news/article?url=${encodeURIComponent(item.link)}`)
      .then((r) => r.json())
      .then((raw) => {
        const data = raw?.isSuccess ? raw.result : raw;
        setContent(data?.content || item.description || "");
        setImage(data?.image || "");
        setArticleUrl(data?.finalUrl || item.link);
      })
      .catch(() => {
        setContent(item.description || "");
        setFetchFailed(true);
      })
      .finally(() => setFetchLoading(false));
  }, [item]);

  useEffect(() => () => {
    summaryStreamRef.current?.();
  }, []);

  const runAiSummary = useCallback(async () => {
    if (summaryLoading) return;
    summaryStreamRef.current?.();
    summaryStreamRef.current = null;
    setSummary("");
    setSummaryError("");
    setSummaryLoading(true);

    try {
      const { jobId } = await apiFetch<{ jobId: string }>("/queue/news-article-summary", {
        method: "POST",
        body: JSON.stringify({
          title: item.title,
          url: articleUrl || item.link,
          source: item.source,
          description: content || item.description || "",
          model: "claude-haiku-4-5",
          refresh: !!summary,
        }),
      });

      const es = new EventSource(`${API_BASE}/queue/news-article-summary/${jobId}/stream`);
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        es.close();
      };
      summaryStreamRef.current = close;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type?: string; text?: string; message?: string };
          if (data.type === "chunk" && data.text) {
            setSummary((prev) => prev + data.text);
          } else if (data.type === "done") {
            setSummaryLoading(false);
            onSummaryCreated?.();
            close();
          } else if (data.type === "error") {
            setSummaryError(data.message || "AI 요약에 실패했습니다.");
            setSummaryLoading(false);
            close();
          }
        } catch {}
      };
      es.onerror = () => {
        setSummaryError("AI 요약 스트림 연결이 끊겼습니다.");
        setSummaryLoading(false);
        close();
      };
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "AI 요약에 실패했습니다.");
      setSummaryLoading(false);
    }
  }, [articleUrl, content, item, summary, summaryLoading, onSummaryCreated]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`rounded-2xl shadow-xl w-full max-w-5xl flex flex-col max-h-[95vh] font-system ${isDark ? "bg-slate-900 border border-white/10" : "bg-white"}`}>
        {/* Modal header */}
        <div className={`flex items-start justify-between gap-3 p-5 border-b ${isDark ? "border-white/10" : "border-slate-100"}`}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-500 mb-1">{item.source}</p>
            <h3 className={`text-xl font-bold leading-snug ${isDark ? "text-white/90" : "text-slate-800"}`}>{item.title}</h3>
            {item.pubDate && (
              <p className={`text-xs mt-1 ${isDark ? "text-white/40" : "text-slate-400"}`}>
                {new Date(item.pubDate).toLocaleDateString("ko-KR", {
                  year: "numeric", month: "long", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className={`transition-colors shrink-0 text-lg leading-none ${isDark ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-600"}`}
          >
            ✕
          </button>
        </div>

        {/* Modal body */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0">
          {fetchLoading ? (
            <div className="space-y-2.5">
              {[...Array(7)].map((_, i) => (
                <div key={i} className={`h-3 bg-slate-100 rounded animate-pulse ${i % 4 === 3 ? "w-2/3" : "w-full"}`} />
              ))}
            </div>
          ) : (
            <>
              {image && (
                <img src={image} alt="" className="w-full rounded-xl object-cover max-h-52 mb-4" />
              )}
              {fetchFailed && (
                <p className="text-2xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mb-3">
                  이 사이트는 외부 접근을 차단합니다. RSS 요약을 표시합니다.
                </p>
              )}
              {content ? (
                <div className="space-y-5">
                  {content.split("\n\n").map((para, i) => (
                    <p key={i} className={`text-lg leading-relaxed ${isDark ? "text-white/70" : "text-slate-600"}`}>{para}</p>
                  ))}
                </div>
              ) : (
                <p className={`text-lg text-center py-8 ${isDark ? "text-white/40" : "text-slate-400"}`}>
                  본문을 가져올 수 없습니다.<br />
                  <span className="text-base">원문 보기에서 직접 확인해주세요.</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* AI 요약 popup panel — body와 footer 사이에 위치 */}
        {summaryOpen && (
          <div className={`border-t flex flex-col shrink-0 overflow-hidden ${isDark ? "border-white/10 bg-slate-800/60" : "border-slate-100 bg-slate-50"}`}
            style={{ maxHeight: "min(240px, 38vh)" }}>
            {/* popup header */}
            <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${isDark ? "border-white/10" : "border-slate-100"}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-500 text-sm">✦</span>
                <span className={`text-sm font-semibold ${isDark ? "text-white/85" : "text-slate-800"}`}>AI 요약</span>
                {summaryLoading && (
                  <span className="flex items-center gap-1 ml-1">
                    <span className="inline-block w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="inline-block w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="inline-block w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={runAiSummary}
                  disabled={summaryLoading}
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                    isDark ? "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className={summaryLoading ? "animate-spin" : ""}>
                    <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                  {summaryLoading ? "요약 중..." : summary ? "다시 요약" : "요약하기"}
                </button>
                <button
                  onClick={() => setSummaryOpen(false)}
                  className={`text-base leading-none transition-colors ${isDark ? "text-white/30 hover:text-white/70" : "text-slate-300 hover:text-slate-600"}`}
                >
                  ✕
                </button>
              </div>
            </div>
            {/* popup content */}
            <div className="px-4 py-3 overflow-y-auto">
              {!summary && !summaryLoading && !summaryError && (
                <p className={`text-sm text-center py-3 ${isDark ? "text-white/35" : "text-slate-400"}`}>
                  요약하기 버튼을 눌러 AI 요약을 생성하세요.
                </p>
              )}
              {summaryLoading && !summary && (
                <p className={`text-sm ${isDark ? "text-white/50" : "text-slate-500"}`}>요약을 생성하고 있습니다...</p>
              )}
              {summary && (
                <div className={`prose prose-sm max-w-none leading-relaxed ${isDark ? "prose-invert text-white/75" : "text-slate-700"}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                </div>
              )}
              {summaryError && (
                <p className="text-xs font-semibold text-red-500">{summaryError}</p>
              )}
            </div>
          </div>
        )}

        {/* Modal footer */}
        <div className={`px-4 py-3 border-t flex items-center gap-2 ${isDark ? "border-white/10" : "border-slate-100"}`}>
          {!fetchLoading && content && (
            <button
              onClick={() => setSummaryOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${
                summaryOpen
                  ? isDark ? "bg-indigo-500/25 text-indigo-300" : "bg-indigo-100 text-indigo-700"
                  : isDark ? "bg-white/8 text-white/55 hover:bg-white/12" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              AI 요약
            </button>
          )}
          <div className="flex-1" />
          <a
            href={articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition-colors"
          >
            원문 보기 →
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Google News panel ─────────────────────────────────────────
function GoogleNewsPanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [items, setItems] = useState<GoogleNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<GoogleNewsCategory>("it");
  const [modalItem, setModalItem] = useState<GoogleNewsItem | null>(null);
  const [summarizedUrls, setSummarizedUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(false); setItems([]);

    fetch(`${API_BASE}/news/naver?category=${category}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const fetched = data?.isSuccess ? (data.result ?? []) : (Array.isArray(data) ? data : []);
        setItems(fetched);
      })
      .catch(() => { if (!ctrl.signal.aborted) setError(true); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });

    return () => ctrl.abort();
  }, [category]);

  // 각 기사의 AI 요약 존재 여부 확인
  useEffect(() => {
    if (items.length === 0) { setSummarizedUrls(new Set()); return; }
    let cancelled = false;
    Promise.all(
      items.map((item) =>
        apiFetch<NewsArticleSummary | null>(`/news/article-summary?url=${encodeURIComponent(item.link)}`)
          .then((s) => (s?.summary ? item.link : null))
          .catch(() => null)
      )
    ).then((results) => {
      if (!cancelled) setSummarizedUrls(new Set(results.filter((r): r is string => r !== null)));
    });
    return () => { cancelled = true; };
  }, [items]);

  const openModal = useCallback((item: GoogleNewsItem) => {
    setModalItem(item);
    window.history.pushState({ newsModal: true }, "", `/main/news?article=${encodeURIComponent(item.link)}`);
  }, []);

  const closeModal = useCallback(() => {
    setModalItem(null);
    if (window.location.pathname.startsWith("/main/news")) {
      window.history.replaceState({}, "", "/main");
    }
  }, []);

  // 브라우저 뒤로가기로 팝업 닫기
  useEffect(() => {
    const handlePop = () => { if (modalItem) setModalItem(null); };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [modalItem]);

  // 요약이 생성되면 인디케이터 즉시 업데이트
  const markSummarized = useCallback((url: string) => {
    setSummarizedUrls((prev) => new Set([...prev, url]));
  }, []);

  return (
    <>
      {modalItem && (
        <NewsModal
          item={modalItem}
          onClose={closeModal}
          onSummaryCreated={() => markSummarized(modalItem.link)}
        />
      )}

      <div className="flex gap-1 mb-3 flex-wrap">
        {GOOGLE_NEWS_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
              category === c.value
                ? "bg-blue-500 text-white"
                : isDark ? "bg-white/10 text-white/50 hover:bg-white/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton /> : error ? (
        <div className={`flex flex-col items-center justify-center py-8 gap-2 ${isDark ? "text-white/40" : "text-slate-400"}`}>
          <span className="text-2xl">📡</span>
          <p className="text-xs">뉴스를 불러올 수 없습니다</p>
        </div>
      ) : (
        /* 모바일: 가로 스와이프 / 데스크탑: 세로 스크롤 */
        <div className="md:space-y-0.5 md:overflow-y-auto md:flex-1 max-md:flex max-md:gap-2.5 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:pb-1 max-md:-mx-5 max-md:px-5">
          {items.map((item, i) => (
            <button
              key={item.link + i}
              onClick={() => openModal(item)}
              className={`group flex gap-2.5 p-2 rounded-lg transition-colors text-left
                md:w-full
                max-md:shrink-0 max-md:w-52 max-md:snap-start max-md:flex-col max-md:gap-1 max-md:border max-md:p-3
                ${isDark
                  ? "hover:bg-white/5 max-md:border-white/10 max-md:bg-white/3"
                  : "hover:bg-blue-50 max-md:border-slate-100 max-md:bg-white"
                }`}
            >
              {/* 번호: 데스크탑만 표시 */}
              <span className={`md:block hidden text-xs font-bold w-4 shrink-0 pt-0.5 text-right ${isDark ? "text-white/30" : "text-slate-300"}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                {/* 모바일 카드에서만 번호 표시 */}
                <span className={`md:hidden text-2xs font-bold mb-1 block ${isDark ? "text-white/25" : "text-slate-300"}`}>{i + 1}</span>
                <p className={`text-xs2 font-medium leading-snug line-clamp-2 transition-colors ${isDark ? "text-white/80 group-hover:text-blue-400" : "text-slate-700 group-hover:text-blue-700"}`}>
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {summarizedUrls.has(item.link) && (
                    <span className={`text-2xs font-bold ${isDark ? "text-indigo-400" : "text-indigo-500"}`} title="AI 요약 있음">✦</span>
                  )}
                  {item.source && <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{item.source}</span>}
                  {item.pubDate && (
                    <>
                      <span className={`text-xs ${isDark ? "text-white/20" : "text-slate-300"}`}>·</span>
                      <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>
                        {new Date(item.pubDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ── GitHub Trending panel ─────────────────────────────────────
function GithubPanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [repos, setRepos] = useState<GHRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [since, setSince] = useState<Since>("daily");

  const fetchRepos = useCallback((period: Since, signal: AbortSignal) => {
    setLoading(true); setError(false); setRepos([]);
    getGithubTrending(period)
      .then((data) => { if (!signal.aborted) setRepos(data); })
      .catch(() => { if (!signal.aborted) setError(true); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchRepos(since, ctrl.signal);
    return () => ctrl.abort();
  }, [since, fetchRepos]);

  return (
    <>
      {/* Period selector */}
      <div className="flex gap-1 mb-3">
        {SINCE_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setSince(o.value)}
            className={`text-xs2 font-semibold px-2.5 py-1 rounded-lg transition-colors ${
              since === o.value
                ? isDark ? "bg-white/90 text-slate-900" : "bg-slate-800 text-white"
                : isDark ? "bg-white/10 text-white/50 hover:bg-white/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton /> : error ? (
        <div className={`flex flex-col items-center justify-center py-8 gap-2 ${isDark ? "text-white/40" : "text-slate-400"}`}>
          <span className="text-2xl">📡</span>
          <p className="text-xs">데이터를 불러올 수 없습니다</p>
        </div>
      ) : (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {repos.map((repo, i) => (
            <a
              key={repo.id}
              href={repo.html_url}
              target="_blank" rel="noopener noreferrer"
              className={`group flex gap-2.5 p-2 rounded-lg transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
            >
              <span className={`text-2xs font-bold w-4 shrink-0 pt-0.5 text-right ${isDark ? "text-white/30" : "text-slate-300"}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs2 font-semibold leading-snug truncate transition-colors ${isDark ? "text-white/80 group-hover:text-indigo-400" : "text-slate-700 group-hover:text-indigo-600"}`}>
                  {repo.full_name}
                </p>
                {repo.description && (
                  <p className={`text-xs leading-snug line-clamp-1 mt-0.5 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                    {repo.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {repo.language && (
                    <span className={`flex items-center gap-1 text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>
                      <span className={`w-2 h-2 rounded-full ${langColor(repo.language)}`} />
                      {repo.language}
                    </span>
                  )}
                  <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>⭐ {formatStars(repo.stargazers_count)}</span>
                  <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>🍴 {formatStars(repo.forks_count)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

// ── Hugging Face panel ────────────────────────────────────────
function HuggingFacePanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [items, setItems] = useState<HFItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<HFCategory>("models");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(false); setItems([]);

    getHuggingFaceTrending(category)
      .then((data) => { if (!ctrl.signal.aborted) setItems(data ?? []); })
      .catch(() => { if (!ctrl.signal.aborted) setError(true); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });

    return () => ctrl.abort();
  }, [category]);

  const getUrl = (item: HFItem) => {
    const name = item.id ?? item.modelId ?? "";
    return `https://huggingface.co/${category === "models" ? "" : category + "/"}${name}`;
  };

  return (
    <>
      {/* Category selector */}
      <div className="flex gap-1 mb-3">
        {HF_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`flex items-center gap-1 text-xs2 font-semibold px-2.5 py-1 rounded-lg transition-colors ${
              category === c.value
                ? "bg-yellow-400 text-yellow-900"
                : isDark ? "bg-white/10 text-white/50 hover:bg-white/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton /> : error ? (
        <div className={`flex flex-col items-center justify-center py-8 gap-2 ${isDark ? "text-white/40" : "text-slate-400"}`}>
          <span className="text-2xl">📡</span>
          <p className="text-xs">데이터를 불러올 수 없습니다</p>
        </div>
      ) : (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {items.map((item, i) => {
            const name = item.id ?? item.modelId ?? "";
            return (
              <a
                key={name}
                href={getUrl(item)}
                target="_blank" rel="noopener noreferrer"
                className={`group flex gap-2.5 p-2 rounded-lg transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-yellow-50"}`}
              >
                <span className={`text-2xs font-bold w-4 shrink-0 pt-0.5 text-right ${isDark ? "text-white/30" : "text-slate-300"}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold leading-snug truncate transition-colors ${isDark ? "text-white/80 group-hover:text-yellow-400" : "text-slate-700 group-hover:text-yellow-700"}`}>
                    {name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.pipeline_tag && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? "text-white/60 bg-white/10" : "text-slate-400 bg-slate-100"}`}>
                        {item.pipeline_tag}
                      </span>
                    )}
                    <span className={`text-2xs ${isDark ? "text-white/40" : "text-slate-400"}`}>❤️ {formatStars(item.likes)}</span>
                    {item.downloads != null && (
                      <span className={`text-2xs ${isDark ? "text-white/40" : "text-slate-400"}`}>⬇️ {formatStars(item.downloads)}</span>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────
export function NewsSection() {
  const { theme } = useTheme();
  const router = useRouter();
  const isDark = theme === "dark";
  const [tab, setTab] = useState<Tab>("naver");
  const viewAllPath = tab === "github"
    ? "/news/feed?category=github"
    : tab === "hf"
      ? "/news/feed?category=huggingface"
      : "/news/feed";

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col">
      {/* Tab bar */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setTab("naver")}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              tab === "naver" ? "bg-blue-500 text-white" : isDark ? "text-white/50 hover:bg-white/10" : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            구글 뉴스
          </button>
          <button
            onClick={() => setTab("github")}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              tab === "github" ? isDark ? "bg-white/90 text-slate-900" : "bg-slate-800 text-white" : isDark ? "text-white/50 hover:bg-white/10" : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            GitHub
          </button>
          <button
            onClick={() => setTab("hf")}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              tab === "hf" ? "bg-yellow-400 text-yellow-900" : isDark ? "text-white/50 hover:bg-white/10" : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            Hugging Face
          </button>
        </div>
        <button
          onClick={() => router.push(viewAllPath)}
          className={`shrink-0 text-xs font-semibold transition-colors ${isDark ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
        >
          전체보기
        </button>
      </div>

      {tab === "naver" && <GoogleNewsPanel />}
      {tab === "github" && <GithubPanel />}
      {tab === "hf" && <HuggingFacePanel />}
    </div>
  );
}
