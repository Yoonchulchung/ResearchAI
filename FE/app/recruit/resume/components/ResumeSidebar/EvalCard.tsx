"use client";

import { type DragEvent, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_CLASS } from "@/recruit/_constants";
import type { EvalItem } from "./types";

function unwrapMarkdownFence(text: string) {
  let value = text.trim();
  if (value.startsWith("```")) {
    value = value.replace(/^```[^\n\r]*(?:\r?\n)?/, "");
    value = value.replace(/\r?\n?```\s*$/, "");
  }
  return value.trim();
}

export function EvalCard({
  item,
  models,
  itemKey,
  open,
  dragging,
  dragOver,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRerun,
  onDelete,
}: {
  item: EvalItem;
  models: { id: string; name: string }[];
  itemKey: string;
  open: boolean;
  dragging: boolean;
  dragOver: boolean;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onRerun: (subjectKey: string, model: string) => void;
  onDelete: (subjectKey: string, type: string) => void;
}) {
  const [selectedModel, setSelectedModel] = useState(item.model);
  const rerunLabel =
    item.type === "spellcheck"
      ? "재검사"
      : item.type === "example"
        ? "재생성"
        : "재평가";
  const markdown = unwrapMarkdownFence(item.result);
  const waitingForFirstChunk = item.loading && !item.result;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-eval-key={itemKey}
      className={`flex shrink-0 flex-col rounded-md border bg-white overflow-hidden transition-colors ${open ? "max-h-[calc(100dvh-9rem)]" : ""} ${
        dragging
          ? "border-indigo-300 opacity-60"
          : dragOver
            ? "border-indigo-300 bg-indigo-50/30"
            : "border-slate-200"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="순서 변경"
          className="shrink-0 cursor-grab rounded-sm px-1 py-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
          aria-label={`${item.title} 순서 변경`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M4 2h.01M8 2h.01M4 6h.01M8 6h.01M4 10h.01M8 10h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path
              d="M3 2l4 3-4 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-xs font-semibold text-slate-700 truncate">
            {item.title}
          </span>
          {item.loading && (
            <span className="shrink-0 flex gap-0.5">
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
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={item.loading}
          className="h-6 rounded-sm border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-600 outline-none disabled:opacity-50"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => onRerun(item.subjectKey, selectedModel)}
          disabled={item.loading}
          className="shrink-0 flex items-center gap-0.5 h-6 px-1.5 rounded-sm border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path
              d="M8.5 2A4.5 4.5 0 1 0 9.5 5.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <path
              d="M7 0.5L8.5 2L7 3.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {rerunLabel}
        </button>
        <button
          onClick={() => onDelete(item.subjectKey, item.type)}
          disabled={item.loading}
          className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-30"
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
      {open && (
        <div className="min-h-[18rem] min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {item.error ? (
            <p className="text-sm text-red-500">{item.error}</p>
          ) : waitingForFirstChunk ? (
            <div className="flex flex-col gap-2 text-sm text-slate-400">
              <p>연결 중....</p>
              <p className="text-xs text-slate-400">
                클라우드 AI 응답을 기다리고 있습니다.
              </p>
            </div>
          ) : !item.result ? (
            <p className="text-sm text-slate-400">생성된 내용이 없습니다.</p>
          ) : (
            <div
              className={`${PROSE_CLASS} break-words text-sm [&_*]:max-w-full [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdown}
              </ReactMarkdown>
              {item.loading && (
                <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-indigo-500 align-middle" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
