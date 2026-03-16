"use client";

import { useEffect, useState, useCallback } from "react";

// ── Google News ──────────────────────────────────────────────
interface GoogleNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
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
function NewsModal({ item, onClose }: { item: GoogleNewsItem; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [image, setImage] = useState("");
  const [articleUrl, setArticleUrl] = useState(item.link);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setFetchLoading(true);
    setFetchFailed(false);
    fetch(`http://localhost:3001/api/news/article?url=${encodeURIComponent(item.link)}`)
      .then((r) => r.json())
      .then((data: { title: string; content: string; image?: string; finalUrl?: string }) => {
        setContent(data.content || item.description || "");
        setImage(data.image || "");
        setArticleUrl(data.finalUrl || item.link);
      })
      .catch(() => {
        setContent(item.description || "");
        setFetchFailed(true);
      })
      .finally(() => setFetchLoading(false));
  }, [item]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl flex flex-col max-h-[95vh]">
        {/* Modal header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-600 mb-1">{item.source}</p>
            <h3 className="text-sm font-bold text-slate-800 leading-snug">{item.title}</h3>
            {item.pubDate && (
              <p className="text-2xs text-slate-400 mt-1">
                {new Date(item.pubDate).toLocaleDateString("ko-KR", {
                  year: "numeric", month: "long", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Modal body */}
        <div className="p-5 overflow-y-auto flex-1">
          {fetchLoading ? (
            <div className="space-y-2.5">
              {[...Array(7)].map((_, i) => (
                <div key={i} className={`h-3 bg-slate-100 rounded animate-pulse ${i % 4 === 3 ? "w-2/3" : "w-full"}`} />
              ))}
            </div>
          ) : (
            <>
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="w-full rounded-xl object-cover max-h-52 mb-4" />
              )}
              {fetchFailed && (
                <p className="text-2xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mb-3">
                  이 사이트는 외부 접근을 차단합니다. RSS 요약을 표시합니다.
                </p>
              )}
              {content ? (
                <div className="space-y-3">
                  {content.split("\n\n").map((para, i) => (
                    <p key={i} className="text-sm text-slate-600 leading-relaxed">{para}</p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">
                  본문을 가져올 수 없습니다.<br />
                  <span className="text-xs">원문 보기에서 직접 확인해주세요.</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Modal footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end">
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
  const [items, setItems] = useState<GoogleNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<GoogleNewsCategory>("it");
  const [modalItem, setModalItem] = useState<GoogleNewsItem | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(false); setItems([]);

    fetch(`http://localhost:3001/api/news/google?category=${category}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: GoogleNewsItem[]) => { if (!ctrl.signal.aborted) setItems(data ?? []); })
      .catch(() => { if (!ctrl.signal.aborted) setError(true); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });

    return () => ctrl.abort();
  }, [category]);

  return (
    <>
      {modalItem && <NewsModal item={modalItem} onClose={() => setModalItem(null)} />}

      <div className="flex gap-1 mb-3 flex-wrap">
        {GOOGLE_NEWS_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
              category === c.value
                ? "bg-blue-500 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton /> : error ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
          <span className="text-2xl">📡</span>
          <p className="text-xs">뉴스를 불러올 수 없습니다</p>
        </div>
      ) : (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {items.map((item, i) => (
            <button
              key={item.link + i}
              onClick={() => setModalItem(item)}
              className="group flex gap-2.5 p-2 rounded-lg hover:bg-blue-50 transition-colors w-full text-left"
            >
              <span className="text-xs text-slate-300 font-bold w-4 shrink-0 pt-0.5 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs2 font-medium text-slate-700 group-hover:text-blue-700 leading-snug line-clamp-2 transition-colors">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {item.source && <span className="text-xs text-slate-400">{item.source}</span>}
                  {item.pubDate && (
                    <>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">
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
  const [repos, setRepos] = useState<GHRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [since, setSince] = useState<Since>("daily");

  const fetchRepos = useCallback((period: Since, signal: AbortSignal) => {
    setLoading(true); setError(false); setRepos([]);
    const days = SINCE_OPTIONS.find((o) => o.value === period)!.days;
    const from = new Date(Date.now() - days * 86400_000).toISOString().split("T")[0];
    fetch(
      `https://api.github.com/search/repositories?q=pushed:>${from}&sort=stars&order=desc&per_page=10`,
      { signal, headers: { Accept: "application/vnd.github+json" } }
    )
      .then((r) => r.json())
      .then((data) => { if (!signal.aborted) setRepos(data.items ?? []); })
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
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton /> : error ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
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
              className="group flex gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <span className="text-2xs text-slate-300 font-bold w-4 shrink-0 pt-0.5 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs2 font-semibold text-slate-700 group-hover:text-indigo-600 leading-snug truncate transition-colors">
                  {repo.full_name}
                </p>
                {repo.description && (
                  <p className="text-xs text-slate-500 leading-snug line-clamp-1 mt-0.5">
                    {repo.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {repo.language && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <span className={`w-2 h-2 rounded-full ${langColor(repo.language)}`} />
                      {repo.language}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">⭐ {formatStars(repo.stargazers_count)}</span>
                  <span className="text-xs text-slate-400">🍴 {formatStars(repo.forks_count)}</span>
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
  const [items, setItems] = useState<HFItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<HFCategory>("models");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(false); setItems([]);

    fetch(
      `https://huggingface.co/api/${category}?sort=trendingScore&direction=-1&limit=10`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((data: HFItem[]) => { if (!ctrl.signal.aborted) setItems(data ?? []); })
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
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton /> : error ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
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
                className="group flex gap-2.5 p-2 rounded-lg hover:bg-yellow-50 transition-colors"
              >
                <span className="text-2xs text-slate-300 font-bold w-4 shrink-0 pt-0.5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 group-hover:text-yellow-700 leading-snug truncate transition-colors">
                    {name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.pipeline_tag && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.pipeline_tag}
                      </span>
                    )}
                    <span className="text-2xs text-slate-400">❤️ {formatStars(item.likes)}</span>
                    {item.downloads != null && (
                      <span className="text-2xs text-slate-400">⬇️ {formatStars(item.downloads)}</span>
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
  const [tab, setTab] = useState<Tab>("naver");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <button
          onClick={() => setTab("naver")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            tab === "naver" ? "bg-blue-500 text-white" : "text-slate-400 hover:bg-slate-100"
          }`}
        >
          구글 뉴스
        </button>
        <button
          onClick={() => setTab("github")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            tab === "github" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-100"
          }`}
        >
          GitHub
        </button>
        <button
          onClick={() => setTab("hf")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            tab === "hf" ? "bg-yellow-400 text-yellow-900" : "text-slate-400 hover:bg-slate-100"
          }`}
        >
          Hugging Face
        </button>
      </div>

      {tab === "naver" && <GoogleNewsPanel />}
      {tab === "github" && <GithubPanel />}
      {tab === "hf" && <HuggingFacePanel />}
    </div>
  );
}
