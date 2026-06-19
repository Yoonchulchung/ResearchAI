"use client";

import type { CompanyListItem } from "@/lib/api/companies";
import type { CompanyAnalysis } from "@/lib/api/company-analysis";

interface DetailHeaderProps {
  company: CompanyListItem;
  analysis: CompanyAnalysis | null;
  isDark: boolean;
  mutedPanel: string;
  subtleText: string;
}

function firstChar(name?: string | null) {
  return (name?.trim()?.[0] ?? "C").toUpperCase();
}

export function DetailHeader({
  company,
  analysis,
  isDark,
  mutedPanel,
  subtleText,
}: DetailHeaderProps) {
  const homeUrl = analysis?.homeUrl ?? company.homeUrl;

  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-center">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-md border text-2xl font-black ${mutedPanel}`}>
        {firstChar(company.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{company.name}</h1>
          <span className={`text-base font-light ${subtleText}`}>| 기업정보</span>
          {homeUrl ? (
            <a
              href={homeUrl}
              target="_blank"
              rel="noreferrer"
              className={`rounded-sm p-1.5 transition-colors ${
                isDark
                  ? "text-white/45 hover:bg-white/10 hover:text-white"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`}
              aria-label="홈페이지 열기"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M10.5 13.5 13.5 10.5M8.8 10.2 7.4 11.6a4 4 0 0 0 5.66 5.66l1.4-1.4M15.2 13.8l1.4-1.4a4 4 0 0 0-5.66-5.66l-1.4 1.4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </a>
          ) : null}
        </div>
        <p className={`mt-1.5 text-sm ${isDark ? "text-white/70" : "text-slate-600"}`}>
          {analysis?.industry ?? company.industry ?? company.companyType ?? "기업 정보"}
        </p>
      </div>
    </section>
  );
}
