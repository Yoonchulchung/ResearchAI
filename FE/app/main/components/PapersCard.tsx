"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPapers, markPaperRead, type Paper } from "@/lib/api/papers";

function IconPaper() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
      <path d="M4.5 2H9.5L12 4.5V13.5C12 14.05 11.55 14.5 11 14.5H4.5C3.95 14.5 3.5 14.05 3.5 13.5V3C3.5 2.45 3.95 2 4.5 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.5 2V4.5H12" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.8 8H10M5.8 10.5H8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconBookmark({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="h-3 w-3" viewBox="0 0 18 18" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path d="M5 3.25h8v11.5L9 12.3l-4 2.45V3.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function PapersCard() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    listPapers({ limit: 50 })
      .then((result) => {
        if (!cancelled) setPapers(result.papers);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMarkRead = (paper: Paper) => {
    if (paper.readAt) return;
    const readAt = new Date().toISOString();
    setPapers((prev) => prev.map((item) => item.id === paper.id ? { ...item, readAt } : item));
    markPaperRead(paper.id).then((updated) => {
      setPapers((prev) => prev.map((item) => item.id === paper.id ? updated : item));
    }).catch(() => {
      setPapers((prev) => prev.map((item) => item.id === paper.id ? { ...item, readAt: undefined } : item));
    });
  };

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-indigo-600">
          <IconPaper />
          <h2 className="text-m font-bold text-slate-700">핫한 논문</h2>
        </div>
        <Link href="/news/papers" className="text-2xs font-semibold text-slate-400 hover:text-indigo-500 transition-colors">
          전체 보기
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
              <div className="h-2.5 bg-slate-100 rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <p className="text-xs text-slate-400">논문 목록을 불러오지 못했습니다</p>
          <Link href="/news/papers" className="text-xs font-semibold text-indigo-500 hover:text-indigo-600">
            페이지에서 다시 시도
          </Link>
        </div>
      ) : papers.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">표시할 논문이 없습니다</p>
      ) : (
        <ul className="md:max-h-85 md:space-y-1 md:overflow-y-auto md:pr-1 max-md:flex max-md:gap-3 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:pb-1 max-md:-mx-5 max-md:px-5">
          {papers.map((paper) => (
            <li key={paper.id} className="max-md:shrink-0 max-md:w-64 max-md:snap-start">
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => handleMarkRead(paper)}
                className={`block rounded-lg px-1 py-2 transition-colors hover:bg-slate-50 max-md:border max-md:border-slate-100 max-md:rounded-xl max-md:p-3 max-md:h-full ${paper.readAt ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-2 text-2xs text-slate-400">
                  <span className="truncate font-semibold text-indigo-500">{paper.sourceName}</span>
                  {paper.publishedAt && <span className="shrink-0">{formatDate(paper.publishedAt)}</span>}
                  {typeof paper.upvotes === "number" && <span className="shrink-0 text-amber-500">▲ {paper.upvotes}</span>}
                  {paper.bookmarked && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-600">
                      <IconBookmark filled />
                      북마크
                    </span>
                  )}
                  {paper.readAt && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-400">읽음</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-relaxed text-slate-700">
                  {paper.title}
                </p>
                {paper.summary ? (
                  <p className="mt-0.5 line-clamp-2 text-2xs leading-relaxed text-slate-400">
                    {paper.summary}
                  </p>
                ) : paper.authors.length > 0 ? (
                  <p className="mt-0.5 line-clamp-1 text-2xs leading-relaxed text-slate-400">
                    {paper.authors.slice(0, 5).join(", ")}
                  </p>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
