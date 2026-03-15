"use client";

import { useEffect, useState, useCallback } from "react";

export function KeywordsCard() {
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchSummary = useCallback(() => {
    setSummaryLoading(true);
    fetch("http://localhost:3001/api/news/summary")
      .then((r) => r.json())
      .then((data: { summary: string }) => {
        setSummary(data.summary ?? "");
        setLastUpdated(new Date());
      })
      .catch(() => setSummary(""))
      .finally(() => setSummaryLoading(false));
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-700">AI 뉴스 브리핑</h2>
          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">AI</span>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-slate-400">
              {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
            </span>
          )}
          <button
            onClick={fetchSummary}
            disabled={summaryLoading}
            className="text-[10px] text-slate-400 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40"
          >
            {summaryLoading ? "⟳ 갱신 중..." : "⟳ 새로고침"}
          </button>
        </div>
      </div>

      {summaryLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mt-1.5 shrink-0" />
              <div className={`h-3.5 bg-slate-100 rounded animate-pulse flex-1 ${i === 4 ? "w-2/3" : "w-full"}`} />
            </div>
          ))}
        </div>
      ) : summary ? (
        <ul className="space-y-2.5">
          {summary
            .split('\n')
            .filter((line) => line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().length > 0)
            .filter((line) => line.trim().length > 0)
            .map((line, i) => {
              const text = line.replace(/^[•\-]\s*/, '').trim();
              if (!text) return null;
              const colonIdx = text.indexOf(']:');
              const hasBracket = text.startsWith('[') && colonIdx !== -1;
              const label = hasBracket ? text.slice(1, colonIdx) : null;
              const body = hasBracket ? text.slice(colonIdx + 2).trim() : text;
              return (
                <li key={i} className="flex gap-2.5 items-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                  <span className="text-sm text-slate-700 leading-snug">
                    {label && <span className="font-semibold text-indigo-700">[{label}]</span>}
                    {label ? ' ' : ''}{body}
                  </span>
                </li>
              );
            })}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
          <span className="text-2xl">📡</span>
          <p className="text-xs">브리핑을 불러올 수 없습니다</p>
          <button onClick={fetchSummary} className="text-xs text-indigo-600 hover:underline mt-1">
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
