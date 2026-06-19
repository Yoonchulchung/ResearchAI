"use client";

import { useEffect, useState } from "react";
import type { ResumeSelfIntro } from "@/lib/api/resume";
import {
  searchCoverLetterQuestions,
  type CoverLetterQuestionSearchItem,
} from "@/lib/api/recruit/cover-letter";

function createLocalId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function CoverLetterBrowsePanel({
  companyName,
  onInsertSelfIntro,
}: {
  companyName?: string;
  onInsertSelfIntro?: (si: ResumeSelfIntro) => void;
}) {
  const [query, setQuery] = useState(companyName?.trim() ?? "");
  const [items, setItems] = useState<CoverLetterQuestionSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setQuery(companyName?.trim() ?? "");
  }, [companyName]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchCoverLetterQuestions(query.trim(), 30)
        .then((res) => {
          if (cancelled) return;
          setItems(res.items);
          setTotal(res.total);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setTotal(0);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const handleInsert = (item: CoverLetterQuestionSearchItem) => {
    onInsertSelfIntro?.({
      id: createLocalId(),
      question: item.question,
      answer: item.answer,
      category: item.tags,
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">
            합격 자소서 검색
          </span>
          {total > 0 && (
            <span className="text-xs text-slate-400">
              {total.toLocaleString()}건
            </span>
          )}
          {loading && (
            <span className="ml-auto w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            className="shrink-0 text-slate-300"
          >
            <path
              d="M5.8 10.1a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6ZM9.2 9.2l2.3 2.3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="성장과정, 도전, 협업, 갈등..."
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-300"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
        {loading ? null : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              className="text-slate-200"
            >
              <path
                d="M5 4h18v20H5V4z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M8 9h12M8 13h12M8 17h7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-sm text-slate-400">검색 결과가 없습니다.</p>
          </div>
        ) : (
          items.map((item) => {
            const coverLetter = item.coverLetter;
            const isOpen = expanded === item.id;
            return (
              <div
                key={item.id}
                className="rounded-md border border-slate-200 bg-white"
              >
                <button
                  onClick={() =>
                    setExpanded((v) => (v === item.id ? null : item.id))
                  }
                  className="w-full min-h-[76px] flex items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className={`mt-1.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  >
                    <path
                      d="M3 2l4 3-4 3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-5 text-slate-800 break-words">
                      {coverLetter.company || "기업명 없음"}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 line-clamp-2 break-words">
                      {item.question || `문항 ${item.number}`}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {coverLetter.position && (
                        <span className="text-xs leading-5 text-slate-400 break-words">
                          {coverLetter.position}
                        </span>
                      )}
                      {coverLetter.season && (
                        <span className="text-xs leading-5 text-slate-400 break-words">
                          {coverLetter.season}
                        </span>
                      )}
                      {item.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs leading-5 px-1.5 rounded-sm bg-indigo-50 text-indigo-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-3 pb-4 pt-3 flex flex-col gap-3">
                    <p className="text-sm text-slate-700 leading-7 whitespace-pre-wrap">
                      {item.answer}
                    </p>
                    {item.keywords && item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.keywords.slice(0, 10).map((keyword) => (
                          <span
                            key={keyword}
                            className="text-xs px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleInsert(item)}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                      >
                        문항 가져오기
                      </button>
                      {coverLetter.url && (
                        <a
                          href={coverLetter.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
                        >
                          원문 보기
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
