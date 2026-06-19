"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_CLASS } from "@/recruit/_constants";
import type { NewsItemState } from "./types";

export function NewsItemCard({
  item,
  onDeepSearch,
  onDelete,
}: {
  item: NewsItemState;
  onDeepSearch: (item: NewsItemState) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-slate-100 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-start gap-1.5 text-left"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path
              d="M3 2l4 3-4 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-sm font-semibold text-slate-800 leading-snug">
            {item.title}
          </span>
          {item.detailLoading && (
            <span className="shrink-0 mt-0.5 flex gap-0.5">
              {[0, 120, 240].map((d) => (
                <span
                  key={d}
                  className="w-1 h-1 rounded-sm bg-indigo-400 animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
          )}
        </button>
        <div className="shrink-0 flex gap-1 mt-0.5">
          <button
            onClick={() => onDeepSearch(item)}
            disabled={item.detailLoading}
            title="세부 검색"
            className="flex items-center gap-0.5 h-6 px-1.5 rounded-sm border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <circle
                cx="4.5"
                cy="4.5"
                r="3"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M7 7l2 2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M4.5 3v3M3 4.5h3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            세부 검색
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="text-slate-300 hover:text-red-400 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M1 1l8 8M9 1L1 9"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          {item.detailError ? (
            <p className="text-sm text-red-500">{item.detailError}</p>
          ) : item.detailLoading ? (
            <p className="text-sm text-slate-400">AI 웹 검색 중...</p>
          ) : item.detailResult ? (
            <div
              className={`${PROSE_CLASS} text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {item.detailResult}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              &ldquo;세부 검색&rdquo; 버튼을 눌러 구체적인 내용을 찾아보세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
