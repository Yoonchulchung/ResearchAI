"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessions } from "@/lib/api";
import { Session } from "@/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function statusInfo(s: Session): { label: string; color: string; dot: string } {
  if (s.researchState === "running" || s.researchState === "pending") {
    return { label: "진행 중", color: "text-blue-600", dot: "bg-blue-400 animate-pulse" };
  }
  const done = s.doneCount ?? 0;
  if (done > 0) {
    return { label: `${done}개 완료`, color: "text-green-600", dot: "bg-green-400" };
  }
  return { label: "대기 중", color: "text-slate-400", dot: "bg-slate-300" };
}

export function PortfolioList() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-700">리서치 포트폴리오</h2>
        <span className="text-xs text-slate-400">{sessions.length}개</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-8 gap-2">
          <span className="text-3xl">📂</span>
          <p className="text-xs">리서치가 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto">
          {sessions.map((s) => {
            const { label, color, dot } = statusInfo(s);
            return (
              <div
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className="group flex flex-col gap-1.5 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 cursor-pointer transition-all"
              >
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${dot}`} />
                  <p className="text-xs font-semibold text-slate-700 leading-snug line-clamp-2 flex-1 group-hover:text-indigo-700 transition-colors">
                    {s.topic}
                  </p>
                </div>
                <div className="flex items-center justify-between pl-4">
                  <span className={`text-2xs font-medium ${color}`}>{label}</span>
                  <span className="text-2xs text-slate-400">{formatDate(s.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
