"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Session } from "@/types";

interface Props {
  session: Session;
  onClose: () => void;
}

export function DetailPanel({ session, onClose }: Props) {
  const doneTasks = (session.items ?? []).filter((t) => t.aiResult);

  return (
    <div className="flex flex-col h-full border-l border-slate-200 bg-white w-[52%] shrink-0">
      {/* Header */}
      <div className="px-6 py-3.5 border-b border-slate-200 flex items-center gap-3 shrink-0">
        <h2 className="font-bold text-sm text-slate-800 truncate flex-1">{session.topic}</h2>
        <span className="text-xs text-slate-400 shrink-0">{doneTasks.length}건 완료</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none shrink-0"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {doneTasks.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-16">
            완료된 리서치 항목이 없습니다.
          </p>
        ) : (
          <div className="space-y-8">
            {doneTasks.map((task) => (
              <section key={task.id}>
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  {task.title}
                </h3>
                <div className="prose prose-sm prose-slate max-w-none
                  [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                  [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
                  [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
                  [&_tr:nth-child(even)]:bg-white [&_tr:nth-child(odd)]:bg-slate-50/50
                  [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-slate-800
                  [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-slate-800
                  [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-slate-700
                  [&_strong]:font-bold [&_strong]:text-slate-800
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                  [&_li]:my-0.5 [&_li]:text-slate-700
                  [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-slate-700
                  [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700
                  [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic
                  [&_hr]:border-slate-200 [&_hr]:my-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.aiResult ?? ""}</ReactMarkdown>
                </div>
                <div className="mt-6 border-b border-slate-100" />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
