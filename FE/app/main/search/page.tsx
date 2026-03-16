"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const res = await fetch(`http://localhost:3001/api/news/search?q=${encodeURIComponent(q)}&limit=10`);
      if (!res.ok) throw new Error("검색 실패");
      const data: SearchResult[] = await res.json();
      setResults(data);
    } catch {
      setError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery);
    }
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    router.replace(`/main/search?q=${encodeURIComponent(query.trim())}`);
    doSearch(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleDeepResearch = () => {
    if (query.trim()) {
      sessionStorage.setItem("dashboard-topic", query.trim());
    }
    router.push("/sessions/new");
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 검색 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          >
            ←
          </button>
          <div className="flex-1 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="검색어를 입력하세요"
              className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || loading}
              className="bg-indigo-600 text-white font-semibold px-5 py-2 rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              검색
            </button>
          </div>
        </div>
      </div>

      {/* 결과 영역 */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* 딥리서치 유도 배너 */}
        {searched && !loading && (
          <div className="mb-5 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-indigo-700">
              더 깊이 분석하려면 AI 딥리서치를 사용해보세요
            </p>
            <button
              onClick={handleDeepResearch}
              className="bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
            >
              딥리서치로 분석
            </button>
          </div>
        )}

        {/* 로딩 스켈레톤 */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-200 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/4 mb-2" />
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-full mb-1" />
                <div className="h-3 bg-gray-200 rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {/* 에러 */}
        {error && !loading && (
          <div className="text-center py-16 text-red-500 text-sm">{error}</div>
        )}

        {/* 결과 없음 */}
        {searched && !loading && !error && results.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            검색 결과가 없습니다.
          </div>
        )}

        {/* 결과 목록 */}
        {!loading && results.length > 0 && (
          <>
            <p className="text-xs text-gray-400 mb-3">
              &ldquo;{initialQuery}&rdquo; 검색 결과 {results.length}건
            </p>
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
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}
