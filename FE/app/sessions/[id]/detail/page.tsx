"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSession } from "@/lib/api";
import { Session } from "@/types";

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession(id)
      .then(setSession)
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm animate-pulse">
        불러오는 중...
      </div>
    );
  }

  if (!session) return null;

  const doneTasks = (session.tasks ?? []).filter((t) => t.result);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto relative flex items-center">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-slate-600 transition-colors text-sm shrink-0 z-10"
          >
            ← 뒤로
          </button>
          <h1 className="absolute inset-x-0 text-center font-bold text-lg text-slate-800 truncate px-24 pointer-events-none">
            {session.topic}
          </h1>
          <span className="ml-auto text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-medium shrink-0 z-10">
            {session.researchCloudAIModel}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-4xl mx-auto space-y-10">
          {doneTasks.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-16">
              완료된 리서치 항목이 없습니다.
            </p>
          ) : (
            doneTasks.map((task) => (
              <section key={task.id}>
                <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span>{task.icon}</span>
                  {task.title}
                </h2>
                <div className="prose prose-sm prose-slate max-w-none
                  [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                  [&_th]:bg-slate-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300
                  [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200
                  [&_tr:nth-child(even)]:bg-white [&_tr:nth-child(odd)]:bg-slate-50/50
                  [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-slate-800
                  [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-slate-800
                  [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-slate-700
                  [&_strong]:font-bold [&_strong]:text-slate-800
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                  [&_li]:my-0.5 [&_li]:text-slate-700
                  [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-slate-700
                  [&_code]:bg-slate-200 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:text-slate-700
                  [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic
                  [&_hr]:border-slate-200 [&_hr]:my-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result ?? ""}</ReactMarkdown>
                </div>
                <div className="mt-6 border-b border-slate-100" />
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
