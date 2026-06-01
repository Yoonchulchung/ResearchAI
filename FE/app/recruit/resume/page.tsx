"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getResume, type ResumeProfile } from "@/lib/api/resume";
import { getExperiences, type Experience } from "@/lib/api/experiences";
import { ExperienceLibrarySection } from "./components/ExperienceLibrarySection";
import { ResumeView } from "./components/ResumeView";

const EMPTY_PROFILE: ResumeProfile = { resumeTargets: [] };

function ResumePageContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<ResumeProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [experiences, setExperiences] = useState<Experience[]>([]);

  useEffect(() => {
    Promise.all([
      getResume().catch(() => null),
      getExperiences().catch(() => [] as Experience[]),
    ]).then(([res, exps]) => {
      setProfile(res ?? EMPTY_PROFILE);
      setExperiences(exps);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 flex items-center gap-3 px-5 py-3.5">
        <button onClick={() => router.push("/recruit")} className="text-slate-300 hover:text-slate-700 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-sm font-bold text-slate-900 tracking-tight">이력서</h1>
        <div className="flex-1" />
        <button
          onClick={() => router.push("/recruit/resume/write?new=1")}
          className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          이력서 추가
        </button>
      </div>

      <div className="flex flex-1 min-h-0 divide-x divide-slate-100">
        <div className="hidden md:block w-64 xl:w-80 shrink-0 overflow-y-auto px-5 py-8">
          {experiences.length > 0 ? (
            <ExperienceLibrarySection
              allExperiences={experiences}
              linkedIds={new Set()}
              onGoTo={(exp) => router.push(`/recruit/doc-store?tab=exp${exp.sourceDocId ? `&doc=${encodeURIComponent(exp.sourceDocId)}` : ""}`)}
            />
          ) : (
            <>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-4">경험 라이브러리</h2>
              <p className="text-xs text-slate-400">저장된 경험이 없습니다.</p>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-8">
            <ResumeView
              profile={profile}
              onEdit={() => router.push("/recruit/resume/write")}
              onSelectTarget={(id) => router.push(`/recruit/resume/${encodeURIComponent(id)}`)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResumePage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>}>
      <ResumePageContent />
    </Suspense>
  );
}
