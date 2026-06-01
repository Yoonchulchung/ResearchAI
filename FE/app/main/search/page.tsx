"use client";

import { useEffect, useState, useRef } from "react";
import { API_BASE } from "@/lib/api/base";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);

  // 인터넷 검색 상태
  const [results, setResults] = useState<SearchResult[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState("");

  // AI 검색 상태
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDone, setAiDone] = useState(false);
  const [aiModel, setAiModel] = useState("");

  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = async (q: string) => {
    if (!q.trim()) return;
    setSearched(true);

    // 이전 요청 취소
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    // 초기화
    setResults([]);
    setWebLoading(true);
    setWebError("");
    setAiText("");
    setAiLoading(true);
    setAiError("");
    setAiDone(false);
    setAiModel("");

    // 인터넷 검색과 AI 검색 동시 시작
    const webPromise = fetch(
      `${API_BASE}/news/search?q=${encodeURIComponent(q)}&limit=10`,
      { signal: abort.signal },
    )
      .then((r) => { if (!r.ok) throw new Error("검색 실패"); return r.json(); })
      .then((raw) => {
        const data = raw?.isSuccess ? (raw.result ?? []) : (Array.isArray(raw) ? raw : []);
        setResults(data);
      })
      .catch((e) => { if (e.name !== "AbortError") setWebError("검색 중 오류가 발생했습니다."); })
      .finally(() => setWebLoading(false));

    const aiPromise = (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/news/ai-answer?q=${encodeURIComponent(q)}`,
          { signal: abort.signal },
        );
        if (!res.ok || !res.body) throw new Error("AI 검색 실패");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "chunk") setAiText((prev) => prev + ev.text);
              if (ev.type === "done") { setAiDone(true); if (ev.model) setAiModel(ev.model); }
              if (ev.type === "error") setAiError(ev.message);
            } catch {}
          }
        }
      } catch (e: unknown) {
        if ((e as Error).name !== "AbortError") setAiError("AI 검색 중 오류가 발생했습니다.");
      } finally {
        setAiLoading(false);
      }
    })();

    await Promise.allSettled([webPromise, aiPromise]);
  };

  useEffect(() => {
    if (initialQuery) doSearch(initialQuery);
    return () => abortRef.current?.abort();
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    router.replace(`/main/search?q=${encodeURIComponent(query.trim())}`);
    doSearch(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSearch(); }
  };

  const handleDeepResearch = () => {
    if (query.trim()) sessionStorage.setItem("dashboard-topic", query.trim());
    router.push("/sessions/new");
  };

  const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  };

  const getModelLabel = (model: string) => {
    if (!model) return "";
    if (model.startsWith("claude-")) return "Claude";
    if (model.startsWith("gemini-")) return "Gemini";
    if (model.startsWith("groq:") || model === "llama-3.3-70b-versatile") return "Groq";
    if (model.startsWith("ollama:")) return "Ollama";
    if (model.startsWith("gpt-")) return "GPT";
    return model.split("-")[0];
  };

  const loading = webLoading || aiLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 검색 헤더 */}
      <div className="bg-white border-b border-gray-200 px-3 py-3 sm:px-4 sm:py-4 sticky top-0 z-10">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          >
            ←
          </button>
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="검색어를 입력하세요"
              className="min-w-0 flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 sm:px-4"
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || loading}
              className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
            >
              검색
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">

        {/* ── AI 검색 결과 ── */}
        {searched && (aiLoading || aiText || aiError) && (
          <div className="order-2 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm sm:order-1">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-indigo-50 bg-linear-to-r from-indigo-50 to-white">
              <span className="text-base">✦</span>
              <span className="text-sm font-semibold text-indigo-700">AI 검색 결과</span>
              {aiLoading && !aiDone && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-indigo-400">
                  <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              )}
              {aiDone && (
                <span className="ml-auto text-xs text-indigo-300">
                  {aiModel ? `by ${getModelLabel(aiModel)}` : "완료"}
                </span>
              )}
            </div>
            <div className="px-5 py-4">
              {aiError ? (
                <p className="text-sm text-red-500">{aiError}</p>
              ) : aiText ? (
                <div className="prose prose-sm prose-slate max-w-none
                  [&_p]:my-1.5 [&_p]:leading-relaxed [&_p]:text-slate-700
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                  [&_li]:my-0.5 [&_li]:text-slate-700
                  [&_strong]:font-semibold [&_strong]:text-slate-800
                  [&_h1]:font-bold [&_h1]:text-slate-800 [&_h1]:mt-3 [&_h1]:mb-1
                  [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:mt-3 [&_h2]:mb-1
                  [&_h3]:font-semibold [&_h3]:text-slate-700 [&_h3]:mt-2 [&_h3]:mb-1
                  [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs
                  [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiText}</ReactMarkdown>
                </div>
              ) : (
                <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
              )}
            </div>
            {/* 딥리서치 유도 */}
            {aiDone && (
              <div className="px-5 pb-4">
                <button
                  onClick={handleDeepResearch}
                  className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                >
                  더 깊이 분석 → 딥리서치로 이동
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 인터넷 검색 결과 ── */}
        {searched && (
          <div className="order-1 sm:order-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
              인터넷 검색
            </p>

            {webLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 border border-gray-200 animate-pulse">
                    <div className="h-3 bg-gray-200 rounded w-1/4 mb-2" />
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-full mb-1" />
                    <div className="h-3 bg-gray-200 rounded w-5/6" />
                  </div>
                ))}
              </div>
            )}

            {webError && !webLoading && (
              <p className="text-center py-10 text-red-500 text-sm">{webError}</p>
            )}

            {!webLoading && !webError && results.length === 0 && searched && (
              <p className="text-center py-10 text-gray-400 text-sm">검색 결과가 없습니다.</p>
            )}

            {!webLoading && results.length > 0 && (
              <div className="space-y-3">
                {results.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white rounded-xl p-4 border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all group"
                  >
                    <p className="text-xs text-green-700 mb-1">{getDomain(r.url)}</p>
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors leading-snug mb-1.5 line-clamp-2">
                      {r.title}
                    </h3>
                    {r.snippet && (
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
                        {r.snippet}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 초기 상태 */}
        {!searched && (
          <p className="text-center py-20 text-gray-400 text-sm">검색어를 입력하고 Enter를 누르세요</p>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        로딩 중...
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
