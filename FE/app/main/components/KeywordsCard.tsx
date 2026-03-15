"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface KeywordItem {
  keyword: string;
  count: number;
}

function interpolateSize(count: number, min: number, max: number): string {
  if (max === min) return "text-sm";
  const ratio = (count - min) / (max - min);
  if (ratio > 0.8) return "text-base font-extrabold";
  if (ratio > 0.6) return "text-sm font-bold";
  if (ratio > 0.35) return "text-xs font-semibold";
  return "text-[11px] font-medium";
}

function interpolateColor(count: number, min: number, max: number): string {
  if (max === min) return "bg-indigo-100 text-indigo-700 border-indigo-200";
  const ratio = (count - min) / (max - min);
  if (ratio > 0.8) return "bg-red-100 text-red-700 border-red-200 hover:bg-red-200";
  if (ratio > 0.6) return "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200";
  if (ratio > 0.35) return "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200";
}

export function KeywordsCard() {
  const router = useRouter();
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchKeywords = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("http://localhost:3001/api/news/keywords?limit=35")
      .then((r) => r.json())
      .then((data: KeywordItem[]) => {
        setKeywords(data ?? []);
        setLastUpdated(new Date());
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const handleKeywordClick = (keyword: string) => {
    sessionStorage.setItem("dashboard-topic", keyword);
    router.push("/sessions/new");
  };

  const min = keywords.length > 0 ? keywords[keywords.length - 1].count : 0;
  const max = keywords.length > 0 ? keywords[0].count : 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-700">뉴스 키워드 트렌드</h2>
          <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">LIVE</span>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-slate-400">
              {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
            </span>
          )}
          <button
            onClick={fetchKeywords}
            disabled={loading}
            className="text-[10px] text-slate-400 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40"
          >
            {loading ? "⟳ 갱신 중..." : "⟳ 새로고침"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-wrap gap-2">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="h-6 rounded-full animate-pulse bg-slate-100"
              style={{ width: `${40 + Math.random() * 60}px` }}
            />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
          <span className="text-2xl">📡</span>
          <p className="text-xs">키워드를 불러올 수 없습니다</p>
          <button
            onClick={fetchKeywords}
            className="text-xs text-indigo-600 hover:underline mt-1"
          >
            다시 시도
          </button>
        </div>
      ) : keywords.length === 0 ? (
        <div className="text-center text-slate-400 text-xs py-8">
          키워드가 없습니다
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map(({ keyword, count }) => (
              <button
                key={keyword}
                onClick={() => handleKeywordClick(keyword)}
                title={`${count}회 언급 · 클릭하면 이 키워드로 리서치 시작`}
                className={`px-2.5 py-1 rounded-full border transition-all cursor-pointer ${interpolateSize(count, min, max)} ${interpolateColor(count, min, max)}`}
              >
                {keyword}
                <span className="ml-1 opacity-60 text-[9px]">{count}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            키워드를 클릭하면 해당 주제로 리서치를 시작합니다
          </p>
        </>
      )}
    </div>
  );
}
