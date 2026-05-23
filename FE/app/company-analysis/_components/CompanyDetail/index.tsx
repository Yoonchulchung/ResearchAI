"use client";

import { useMemo } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import type { CompanyAnalysis, SwotAnalysis } from "@/lib/api/company-analysis";
import { buildZippoomApartmentUrl } from "@/lib/real-estate-url";
import { COMPETENCY_LABELS, CORP_CLASS_LABEL } from "../../_constants";
import { computeReliability, formatApartmentPriceSummary, cleanNewsTitle, isDisplayableNewsTitle } from "../../_utils";
import { HrSection } from "./HrSection";
import { FinancialChart, FinancialTable } from "./FinancialSection";
import { ScoreDetailTable } from "./ScoreDetailTable";
import { ReliabilityModal } from "./ReliabilityModal";

// ─── Atoms ────────────────────────────────────────────────────────────────────

function SectionHeader({ title, badge, isDark }: { title: string; badge?: string; isDark: boolean }) {
  return (
    <div className={`border-b pb-3 mb-4 flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}>
      <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-800"}`}>{title}</h3>
      {badge && <span className="text-[10px] font-mono text-slate-500 border px-1 border-slate-500">{badge}</span>}
    </div>
  );
}

function InfoItem({ label, children, isDark }: { label: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-widest mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
      <div className={`text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>{children}</div>
    </div>
  );
}

function SwotGrid({ swot, isDark }: { swot: SwotAnalysis; isDark: boolean }) {
  const quadrants = [
    { key: "S" as const, label: "Strengths 강점", bg: isDark ? "bg-emerald-900/20 border-emerald-700/40" : "bg-emerald-50 border-emerald-200", header: isDark ? "text-emerald-400" : "text-emerald-700" },
    { key: "W" as const, label: "Weaknesses 약점", bg: isDark ? "bg-red-900/20 border-red-700/40" : "bg-red-50 border-red-200", header: isDark ? "text-red-400" : "text-red-700" },
    { key: "O" as const, label: "Opportunities 기회", bg: isDark ? "bg-blue-900/20 border-blue-700/40" : "bg-blue-50 border-blue-200", header: isDark ? "text-blue-400" : "text-blue-700" },
    { key: "T" as const, label: "Threats 위협", bg: isDark ? "bg-amber-900/20 border-amber-700/40" : "bg-amber-50 border-amber-200", header: isDark ? "text-amber-400" : "text-amber-700" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {quadrants.map(({ key, label, bg, header }) => (
        <div key={key} className={`rounded-sm border p-4 ${bg}`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${header}`}>{label}</p>
          <ul className="space-y-1.5">
            {(swot[key] ?? []).map((item, i) => (
              <li key={i} className={`flex gap-2 text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                <span className={`shrink-0 font-mono ${header}`}>·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── CompanyDetail ────────────────────────────────────────────────────────────

interface Props {
  selected: CompanyAnalysis;
  companies: CompanyAnalysis[];
  isDark: boolean;
  isGlass: boolean;
  selectedCompanyIsAnalyzing: boolean;
  reliabilityOpen: boolean;
  setReliabilityOpen: (v: boolean) => void;
  onBack: () => void;
  onReanalyze: (name: string) => void;
  onScroll: () => void;
}

export function CompanyDetail({
  selected, companies, isDark, isGlass, selectedCompanyIsAnalyzing,
  reliabilityOpen, setReliabilityOpen, onBack, onReanalyze, onScroll,
}: Props) {
  const card = `border rounded-sm p-5 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`;

  const radarData = useMemo(() => COMPETENCY_LABELS.map(({ key, label }) => {
    const avg = companies.length > 0 ? Math.round(companies.reduce((s, c) => s + (c.scores[key] ?? 0), 0) / companies.length) : 0;
    return { subject: label, value: selected.scores[key] ?? 0, avg, fullMark: 100 };
  }), [selected, companies]);

  const recentNewsForDisplay = useMemo(() => (selected.recentNews ?? [])
    .map((n) => ({ ...n, title: cleanNewsTitle(n.title) }))
    .filter((n) => isDisplayableNewsTitle(n.title, n.url)),
  [selected.recentNews]);

  return (
    <div onScroll={onScroll} className={`flex-1 overflow-y-auto px-2 py-3 md:px-10 md:py-8 ${isGlass ? "" : isDark ? "bg-slate-900" : "bg-[#f4f5f7]"}`}>
      <div className="md:max-w-5xl md:mx-auto space-y-6">

        {/* 헤더 */}
        <div className={`border-b pb-4 ${isDark ? "border-slate-700" : "border-slate-300"}`}>
          <button className={`md:hidden flex items-center gap-1 text-sm mb-3 ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800"}`} onClick={onBack}>
            ← 목록
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight break-words ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selected.companyName}</h2>
                {selected.homeUrl && (
                  <a href={selected.homeUrl} target="_blank" rel="noopener noreferrer" title="공식 홈페이지"
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded-sm transition-colors shrink-0 ${isDark ? "border-slate-600 text-blue-400 hover:bg-slate-800" : "border-slate-300 text-blue-600 hover:bg-slate-50"}`}>
                    홈페이지 ↗
                  </a>
                )}
              </div>
              {/* 모바일 정보 줄 */}
              <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                <span>{new Date(selected.updatedAt).toLocaleDateString("ko-KR")}</span>
                <span className="truncate max-w-[140px]">{selected.aiModel?.split("-").slice(0, 3).join("-") || "Unknown"}</span>
                {selected.estimatedFees != null && selected.estimatedFees > 0 && <span className="text-amber-500 font-semibold">${selected.estimatedFees.toFixed(4)}</span>}
                {(() => {
                  const { score } = computeReliability(selected);
                  const gradeLabel = score >= 85 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : "D";
                  return (
                    <button onClick={() => setReliabilityOpen(true)} className={`inline-flex items-center gap-0.5 text-xs font-semibold transition-opacity hover:opacity-70 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      신뢰도 {gradeLabel} · {score}%
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0"><path d="M2 8L8 2M8 2H3M8 2V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  );
                })()}
              </div>
              {/* 데스크탑 정보 줄 */}
              <p className={`hidden sm:block text-sm mt-2 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                DATE: {new Date(selected.updatedAt).toLocaleString("en-US", { hour12: false })} | MODEL: {selected.aiModel || "Unknown"}
                {(selected.inputTokens != null || selected.outputTokens != null) && (
                  <span className="ml-3">
                    | IN: {(selected.inputTokens ?? 0).toLocaleString()} / OUT: {(selected.outputTokens ?? 0).toLocaleString()} tokens
                    {selected.estimatedFees != null && selected.estimatedFees > 0 && <span className="ml-2 text-amber-500">${selected.estimatedFees.toFixed(4)}</span>}
                  </span>
                )}
                {(() => {
                  const { score } = computeReliability(selected);
                  const gradeLabel = score >= 85 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : "D";
                  return (
                    <button onClick={() => setReliabilityOpen(true)} className={`ml-3 inline-flex items-center gap-0.5 text-xs font-semibold transition-opacity hover:opacity-70 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      신뢰도 {gradeLabel} · {score}%
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0"><path d="M2 8L8 2M8 2H3M8 2V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  );
                })()}
              </p>
            </div>
            <button onClick={() => onReanalyze(selected.companyName)} disabled={selectedCompanyIsAnalyzing}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold border rounded-sm transition-colors ${isDark ? "border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50" : "border-slate-400 text-slate-700 hover:bg-slate-100 disabled:opacity-50"}`}>
              {selectedCompanyIsAnalyzing ? "분석 중" : "재분석"}
            </button>
          </div>
        </div>

        {/* 요약 */}
        {selected.summary && (
          <section className={`p-5 border-l-4 rounded-r-sm ${isDark ? "bg-slate-800 border-blue-600" : "bg-white border-blue-800 shadow-sm"}`}>
            <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 ${isDark ? "text-blue-400" : "text-blue-800"}`}>Overall Summary</h3>
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.summary}</p>
          </section>
        )}

        {/* 기업 개요 */}
        {(selected.ceoName || selected.foundedDate || selected.corpClass || selected.industry || selected.companySize || selected.address || selected.dartUrl || selected.creditRating || selected.jobPostings?.length) && (
          <section className={card}>
            <SectionHeader title="기업 개요 (Company Overview)" badge="INFO" isDark={isDark} />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
              {selected.ceoName && <InfoItem label="대표이사" isDark={isDark}>{selected.ceoName}</InfoItem>}
              {selected.foundedDate && (
                <InfoItem label="설립일" isDark={isDark}>
                  {selected.foundedDate.length === 8
                    ? `${selected.foundedDate.slice(0, 4)}.${selected.foundedDate.slice(4, 6)}.${selected.foundedDate.slice(6, 8)}`
                    : selected.foundedDate}
                </InfoItem>
              )}
              {selected.corpClass && (
                <InfoItem label="상장구분" isDark={isDark}>
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-sm font-semibold ${selected.corpClass === "Y" ? "bg-blue-100 text-blue-700" : selected.corpClass === "K" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"}`}>
                      {CORP_CLASS_LABEL[selected.corpClass] ?? selected.corpClass}
                    </span>
                    {(selected.corpClass === "Y" || selected.corpClass === "K") && selected.stockCode && (
                      <a href={`https://www.tossinvest.com/stocks/A${selected.stockCode}/order`} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex items-center gap-0.5 text-xs hover:underline shrink-0 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                        토스증권 ↗
                      </a>
                    )}
                  </span>
                </InfoItem>
              )}
              {selected.industry && <InfoItem label="업종" isDark={isDark}>{selected.industry}</InfoItem>}
              {selected.companySize && (
                <InfoItem label="기업 규모" isDark={isDark}>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-sm font-semibold ${
                    selected.companySize === "대기업" ? "bg-blue-100 text-blue-800" :
                    selected.companySize === "중견기업" ? "bg-violet-100 text-violet-800" :
                    selected.companySize === "스타트업" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                  }`}>{selected.companySize}</span>
                </InfoItem>
              )}
              {selected.creditRating && <InfoItem label="신용등급" isDark={isDark}><span className="font-bold font-mono text-base">{selected.creditRating}</span></InfoItem>}
              {selected.employeeHistory && selected.employeeHistory.length > 0 ? (() => {
                const hist = selected.employeeHistory!;
                const latest = hist[hist.length - 1];
                const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
                const delta = (prev?.total != null && latest.total != null) ? latest.total - prev.total : null;
                const deltaSign = delta != null ? (delta > 0 ? "+" : "") : "";
                const deltaPct = (delta != null && prev?.total) ? ((delta / prev.total) * 100).toFixed(1) : null;
                return (
                  <div className={`col-span-2 md:col-span-3 p-4 rounded-sm border ${isDark ? "bg-slate-700/30 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <p className={`text-[10px] font-semibold uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"}`}>임직원 현황</p>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-white text-slate-400 border-slate-300"}`}>
                        DART 전자공시시스템 ({hist.map((e) => e.year).join(" · ")}년)
                      </span>
                    </div>
                    <div className={`flex flex-wrap gap-4 mb-3 pb-3 border-b ${isDark ? "border-slate-600" : "border-slate-200"}`}>
                      {latest.total != null && <span className={`text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>총 직원수 {latest.total.toLocaleString()}명</span>}
                      {delta != null && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${delta > 0 ? (isDark ? "text-emerald-400" : "text-emerald-700") : delta < 0 ? (isDark ? "text-red-400" : "text-red-700") : (isDark ? "text-slate-400" : "text-slate-500")}`}>{deltaSign}{delta.toLocaleString()}명 ({deltaSign}{deltaPct}%) vs {prev!.year}년</span>}
                      {latest.avgTenure && <span className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>평균 근속연수 {latest.avgTenure}</span>}
                      {latest.avgSalary && <span className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>평균급여 {latest.avgSalary}</span>}
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {(latest.regular != null || latest.contract != null) && (
                        <div className="flex gap-2">
                          <span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>근무형태</span>
                          <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                            {[latest.regular != null && latest.total ? `정규직 ${latest.regular.toLocaleString()}명(${Math.round(latest.regular / latest.total * 100)}%)` : null, latest.contract != null && latest.total ? `계약직 ${latest.contract.toLocaleString()}명(${Math.round(latest.contract / latest.total * 100)}%)` : null].filter(Boolean).join("  ")}
                          </span>
                        </div>
                      )}
                      {(latest.maleCount != null || latest.femaleCount != null) && (
                        <div className="flex gap-2">
                          <span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>성별</span>
                          <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                            {[latest.maleCount != null && latest.total ? `남성 ${latest.maleCount.toLocaleString()}명(${Math.round(latest.maleCount / latest.total * 100)}%)` : null, latest.femaleCount != null && latest.total ? `여성 ${latest.femaleCount.toLocaleString()}명(${Math.round(latest.femaleCount / latest.total * 100)}%)` : null].filter(Boolean).join("  ")}
                          </span>
                        </div>
                      )}
                      {(latest.maleTenure || latest.femaleTenure) && (
                        <div className="flex gap-2"><span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>근속연수</span><span className={isDark ? "text-slate-300" : "text-slate-700"}>남성 {latest.maleTenure ?? "—"} / 여성 {latest.femaleTenure ?? "—"}</span></div>
                      )}
                      {(latest.maleSalary || latest.femaleSalary) && (
                        <div className="flex gap-2"><span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>평균급여</span><span className={isDark ? "text-slate-300" : "text-slate-700"}>남성 {latest.maleSalary ?? "—"} / 여성 {latest.femaleSalary ?? "—"}</span></div>
                      )}
                    </div>
                  </div>
                );
              })() : selected.employees ? <InfoItem label="사원수" isDark={isDark}>{selected.employees}</InfoItem> : null}
              {selected.multiYearFinancials?.at(-1)?.revenueFormatted && (
                <InfoItem label={`매출 (${selected.multiYearFinancials!.at(-1)!.year})`} isDark={isDark}>{selected.multiYearFinancials!.at(-1)!.revenueFormatted}</InfoItem>
              )}
              {selected.capital && <InfoItem label="자본금" isDark={isDark}>{selected.capital}</InfoItem>}
            </div>
            {selected.address && (
              <div className="mt-4">
                <InfoItem label="주소" isDark={isDark}>
                  <span className="flex items-center gap-2 flex-wrap">
                    <span>{selected.address}</span>
                    <a href={`https://map.naver.com/v5/search/${encodeURIComponent(selected.address)}`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-0.5 text-xs hover:underline shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>지도 ↗</a>
                    <a href={selected.apartmentPrices?.naverLandUrl ?? buildZippoomApartmentUrl(selected.address)} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-0.5 text-xs hover:underline shrink-0 ${isDark ? "text-orange-400" : "text-orange-600"}`}>부동산 ↗</a>
                    {formatApartmentPriceSummary(selected.apartmentPrices) && (
                      <span className={`inline-flex items-center gap-1 text-xs shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        <span className={isDark ? "text-slate-600" : "text-slate-300"}>|</span>
                        <span>{formatApartmentPriceSummary(selected.apartmentPrices)}</span>
                      </span>
                    )}
                  </span>
                </InfoItem>
              </div>
            )}
            {selected.dartUrl && (
              <div className="mt-4">
                <InfoItem label="DART 공시" isDark={isDark}><a href={selected.dartUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs hover:underline ${isDark ? "text-blue-400" : "text-blue-600"}`}>공시 바로가기 ↗</a></InfoItem>
              </div>
            )}
            {selected.hrAnalysis?.careerPageUrl && (
              <div className="mt-4">
                <InfoItem label="채용 공고 사이트" isDark={isDark}><a href={selected.hrAnalysis.careerPageUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs hover:underline ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>공식 채용 페이지 ↗</a></InfoItem>
              </div>
            )}
            {selected.jobPostings && selected.jobPostings.length > 0 && (
              <div className={`mt-4 pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>채용 공고</p>
                <ul className="space-y-1.5">
                  {selected.jobPostings.slice(0, 5).map((j, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className={`text-xs font-mono shrink-0 ${isDark ? "text-slate-600" : "text-slate-400"}`}>{i + 1}</span>
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className={`text-xs hover:underline truncate flex-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>{j.title}</a>
                      {j.date && <span className={`text-xs font-mono shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{j.date}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* 기업 프로파일 */}
        {selected.companyProfile && (
          <section className={card}>
            <SectionHeader title="기업 프로파일 (Company Profile)" badge="AI" isDark={isDark} />
            <div className="space-y-5">
              {selected.companyProfile.businessArea && <div><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>사업영역</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.businessArea}</p></div>}
              {selected.companyProfile.businessStatus && <div><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>사업현황</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.businessStatus}</p></div>}
              {selected.companyProfile.coreValues?.length > 0 && (
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>핵심가치</p>
                  <div className="flex flex-wrap gap-2">{selected.companyProfile.coreValues.map((v) => <span key={v} className={`inline-block px-3 py-1 text-xs font-medium border rounded-sm ${isDark ? "bg-blue-900/30 text-blue-300 border-blue-700/50" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{v}</span>)}</div>
                </div>
              )}
              {selected.companyProfile.jobIntroduction && selected.companyProfile.jobIntroduction.length > 0 && (
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>직무소개</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {selected.companyProfile.jobIntroduction.map((job) => (
                      <div key={job.name} className={`px-3 py-2 rounded-sm border ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                        <p className={`text-xs font-semibold mb-0.5 ${isDark ? "text-blue-400" : "text-blue-700"}`}>{job.name}</p>
                        <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>{job.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selected.companyProfile.historyAchievements && <div><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>역사 및 주요 업적</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.historyAchievements}</p></div>}
              {selected.companyProfile.socialContribution && <div><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>사회공헌활동</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.socialContribution}</p></div>}
              {(selected.companyProfile.employeeCount || selected.companyProfile.brandImage || selected.companyProfile.specialNotes) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selected.companyProfile.employeeCount && <InfoItem label="임직원수" isDark={isDark}>{selected.companyProfile.employeeCount}</InfoItem>}
                  {selected.companyProfile.brandImage && <div className="md:col-span-2"><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>CI · 브랜드 이미지</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.brandImage}</p></div>}
                  {selected.companyProfile.specialNotes && <div className={`md:col-span-2 p-3 rounded-sm border-l-4 ${isDark ? "bg-amber-900/20 border-amber-500" : "bg-amber-50 border-amber-400"}`}><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${isDark ? "text-amber-400" : "text-amber-700"}`}>특기 사항</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.specialNotes}</p></div>}
                </div>
              )}
              {(selected.companyProfile.businessPromotion || selected.companyProfile.currentYearGoal || selected.companyProfile.nextYearGoal) && (
                <div className={`pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${isDark ? "text-slate-500" : "text-slate-400"}`}>전략 및 목표</p>
                  <div className="space-y-3">
                    {selected.companyProfile.businessPromotion && <div><p className={`text-xs font-semibold mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>사업 추진</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.businessPromotion}</p></div>}
                    {selected.companyProfile.currentYearGoal && <div><p className={`text-xs font-semibold mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>올해 목표</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.currentYearGoal}</p></div>}
                    {selected.companyProfile.nextYearGoal && <div><p className={`text-xs font-semibold mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>내년 목표</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.nextYearGoal}</p></div>}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 사업 부문 */}
        {selected.businessSegments && selected.businessSegments.length > 0 && (
          <section className={card}>
            <SectionHeader title="사업 부문 (Business Segments)" badge="AI" isDark={isDark} />
            <div className="space-y-4">
              {selected.segmentSources && selected.segmentSources.length > 0 && (
                <div className={`flex flex-wrap gap-2 pb-1 mb-2 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <span className={`text-[10px] font-semibold self-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>출처</span>
                  {selected.segmentSources.map((src, si) => (
                    <a key={si} href={src.url} target="_blank" rel="noopener noreferrer"
                      className={`text-[11px] px-2 py-0.5 rounded-sm border truncate max-w-[280px] hover:underline ${isDark ? "bg-slate-800 text-blue-400 border-slate-700 hover:text-blue-300" : "bg-white text-blue-600 border-slate-200 hover:text-blue-800"}`}
                      title={src.title}>{src.title.length > 40 ? src.title.slice(0, 40) + "…" : src.title}</a>
                  ))}
                </div>
              )}
              {selected.businessSegments.map((seg, i) => (
                <div key={i} className={`p-4 rounded-sm border ${isDark ? "bg-slate-700/30 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{seg.name}</span>
                    {seg.revenueShare && <span className={`text-xs font-bold px-2.5 py-0.5 rounded-sm border ${isDark ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>매출비중 {seg.revenueShare}</span>}
                    {seg.corporateCount && <span className={`text-xs font-mono px-2 py-0.5 rounded-sm border ${isDark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-white text-slate-500 border-slate-300"}`}>법인 {seg.corporateCount}</span>}
                  </div>
                  {seg.subsidiaries && seg.subsidiaries.length > 0 && <div className="flex gap-2 mb-2"><span className={`shrink-0 text-xs font-semibold w-16 mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>종속회사</span><p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>{seg.subsidiaries.join(", ")}</p></div>}
                  {seg.mainProducts && <div className="flex gap-2 mb-2"><span className={`shrink-0 text-xs font-semibold w-16 mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>주요제품</span><p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>{seg.mainProducts}</p></div>}
                  {seg.description && <p className={`text-xs leading-relaxed mt-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{seg.description}</p>}
                  {seg.facilities && <div className={`mt-2 pt-2 border-t text-xs ${isDark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-500"}`}>{seg.facilities}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 경쟁사 */}
        {selected.competitors && selected.competitors.length > 0 && (
          <section className={card}>
            <SectionHeader title="경쟁사 분석 (Competitors)" badge="CRAWLED" isDark={isDark} />
            <div className="space-y-3">
              {selected.competitors.map((comp, i) => {
                const threat = comp.threatLevel ?? "medium";
                const threatConfig = {
                  high: { label: "위협 높음", cls: isDark ? "bg-red-900/40 text-red-300 border-red-700/50" : "bg-red-50 text-red-700 border-red-200" },
                  medium: { label: "위협 중간", cls: isDark ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50" : "bg-yellow-50 text-yellow-700 border-yellow-200" },
                  low: { label: "위협 낮음", cls: isDark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-slate-100 text-slate-500 border-slate-200" },
                }[threat];
                return (
                  <div key={i} className={`p-4 rounded-sm border ${isDark ? "bg-slate-700/30 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <p className={`text-sm font-semibold ${isDark ? "text-blue-300" : "text-blue-700"}`}>{comp.name}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border ${threatConfig.cls}`}>{threatConfig.label}</span>
                      {comp.marketScope && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border ${isDark ? "bg-slate-700 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{comp.marketScope === "domestic" ? "국내" : "해외·국내 영향"}</span>}
                      {comp.siteUrl && <a href={comp.siteUrl} target="_blank" rel="noopener noreferrer" className={`ml-auto text-xs hover:underline ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"}`}>사이트 ↗</a>}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex gap-2"><span className={`shrink-0 text-xs font-semibold w-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>경쟁 이유</span><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{comp.reason}</p></div>
                      <div className="flex gap-2"><span className={`shrink-0 text-xs font-semibold w-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>필요 역량</span><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{comp.needed}</p></div>
                      {comp.sourceUrl && <div className="flex gap-2"><span className={`shrink-0 text-xs font-semibold w-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>크롤링 근거</span><a href={comp.sourceUrl} target="_blank" rel="noopener noreferrer" className={`text-sm leading-relaxed hover:underline truncate ${isDark ? "text-blue-400" : "text-blue-700"}`}>{comp.sourceTitle || comp.sourceUrl}</a></div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 경영이념·인재상 */}
        {selected.missionVision && (selected.missionVision.mission || selected.missionVision.vision || selected.missionVision.coreValues?.length || selected.missionVision.talentProfile) && (
          <section className={card}>
            <SectionHeader title="경영이념 · 인재상 (Mission & Values)" badge="AI" isDark={isDark} />
            <div className="space-y-5">
              {selected.missionVision.mission && <div><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>미션 (Mission)</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.missionVision.mission}</p></div>}
              {selected.missionVision.vision && <div><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>비전 (Vision)</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.missionVision.vision}</p></div>}
              {selected.missionVision.coreValues?.length > 0 && <div><p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>핵심 가치 (Core Values)</p><div className="flex flex-wrap gap-2">{selected.missionVision.coreValues.map((v) => <span key={v} className={`inline-block px-3 py-1 text-xs font-medium border rounded-sm ${isDark ? "bg-blue-900/30 text-blue-300 border-blue-700/50" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{v}</span>)}</div></div>}
              {selected.missionVision.talentProfile && <div className={`p-4 rounded-sm border-l-4 ${isDark ? "bg-slate-700/40 border-amber-500" : "bg-amber-50 border-amber-500"}`}><p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-amber-400" : "text-amber-700"}`}>인재상</p><p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.missionVision.talentProfile}</p></div>}
            </div>
          </section>
        )}

        {/* HR 분석 */}
        {selected.hrAnalysis && (
          <section className={card}>
            <SectionHeader title="HR 분석 (Human Resources)" badge="AI" isDark={isDark} />
            <HrSection hr={selected.hrAnalysis} isDark={isDark} />
            {selected.hrTechSources && selected.hrTechSources.length > 0 && (
              <div className={`mt-6 pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>기술 조직·HRD 크롤링 근거</p>
                <ul className="space-y-1.5">
                  {selected.hrTechSources.slice(0, 8).map((src, i) => (
                    <li key={i} className="flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border ${isDark ? "bg-slate-700 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{src.category}</span>
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className={`text-xs hover:underline truncate ${isDark ? "text-blue-400" : "text-blue-700"}`}>{src.title || src.url}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* SWOT */}
        {selected.swot && (selected.swot.S?.length || selected.swot.W?.length || selected.swot.O?.length || selected.swot.T?.length) && (
          <section className={card}><SectionHeader title="SWOT 분석" badge="AI" isDark={isDark} /><SwotGrid swot={selected.swot} isDark={isDark} /></section>
        )}

        {/* 재무 */}
        {selected.multiYearFinancials && selected.multiYearFinancials.length > 0 && (
          <section className={card}>
            <SectionHeader title="재무 현황 (Financial Overview)" badge="DART" isDark={isDark} />
            <FinancialChart data={selected.multiYearFinancials} isDark={isDark} />
            <div className="mt-6"><FinancialTable data={selected.multiYearFinancials} isDark={isDark} /></div>
          </section>
        )}

        {/* 역량 프로파일 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className={`border rounded-sm p-6 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`}>
            <SectionHeader title="역량 프로파일" isDark={isDark} />
            <div className="h-[540px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke={isDark ? "#475569" : "#cbd5e1"} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: isDark ? "#cbd5e1" : "#475569", fontSize: 11, fontWeight: 500 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#ffffff", borderColor: isDark ? "#334155" : "#e2e8f0", color: isDark ? "#f8fafc" : "#0f172a", fontSize: "12px", borderRadius: "2px", boxShadow: "none" }} />
                  {companies.length > 0 && <Radar name="시장 평균 (Market Avg)" dataKey="avg" stroke={isDark ? "#64748b" : "#cbd5e1"} strokeDasharray="3 3" fill="none" strokeWidth={1.5} />}
                  <Radar name={selected.companyName} dataKey="value" stroke={isDark ? "#3b82f6" : "#1d4ed8"} fill={isDark ? "#3b82f6" : "#1d4ed8"} fillOpacity={0.15} strokeWidth={2} />
                  <Legend wrapperStyle={{ paddingTop: 20, fontSize: 11, fontFamily: "monospace" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <div className="space-y-6"><ScoreDetailTable scores={selected.scores} reasons={selected.reasons} isDark={isDark} /></div>
        </div>

        {/* 조직문화 */}
        {selected.jobplanetSummary && (
          <section className={card}><SectionHeader title="조직 문화 (Corporate Culture)" badge="REVIEW" isDark={isDark} /><pre className={`text-sm leading-relaxed font-sans whitespace-pre-wrap ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.jobplanetSummary}</pre></section>
        )}

        {/* 기업 분석 보고서 */}
        {selected.report && (
          <section className={card}>
            <SectionHeader title="기업 분석 보고서 (Company Report)" badge="AI" isDark={isDark} />
            <div className="space-y-4">
              {selected.report.split(/\n\n+/).map((paragraph, i) => {
                if (paragraph.startsWith("## ")) return <h4 key={i} className={`text-sm font-medium mt-2 first:mt-0 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{paragraph.replace(/^## \d+\. /, "")}</h4>;
                return <p key={i} className={`text-sm font-normal leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>{paragraph}</p>;
              })}
            </div>
          </section>
        )}

        {/* 최근 뉴스 */}
        {recentNewsForDisplay.length > 0 && (
          <section className={card}>
            <SectionHeader title="최근 주요 기사 (Recent News)" badge="WEB" isDark={isDark} />
            <ul className="space-y-3">
              {recentNewsForDisplay.map((n, i) => (
                <li key={i} className={`pb-3 ${i < recentNewsForDisplay.length - 1 ? `border-b ${isDark ? "border-slate-700" : "border-slate-100"}` : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className={`text-xs font-mono mt-0.5 shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {n.category && (
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border ${
                            n.category === "신사업" ? (isDark ? "bg-blue-900/40 text-blue-300 border-blue-700/50" : "bg-blue-50 text-blue-700 border-blue-200") :
                            n.category === "B2B확장" ? (isDark ? "bg-violet-900/40 text-violet-300 border-violet-700/50" : "bg-violet-50 text-violet-700 border-violet-200") :
                            n.category === "법적분쟁" ? (isDark ? "bg-red-900/40 text-red-300 border-red-700/50" : "bg-red-50 text-red-700 border-red-200") :
                            n.category === "경영진" ? (isDark ? "bg-amber-900/40 text-amber-300 border-amber-700/50" : "bg-amber-50 text-amber-700 border-amber-200") :
                            n.category === "신제품" ? (isDark ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" : "bg-emerald-50 text-emerald-700 border-emerald-200") :
                            n.category === "재무" ? (isDark ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50" : "bg-cyan-50 text-cyan-700 border-cyan-200") :
                            (isDark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-slate-100 text-slate-500 border-slate-200")
                          }`}>{n.category}</span>
                        )}
                        <a href={n.url} target="_blank" rel="noopener noreferrer" className={`text-sm font-medium hover:underline truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>{n.title}</a>
                      </div>
                      {n.summary && <p className={`text-xs leading-relaxed ml-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>{n.summary}</p>}
                      {n.date && <p className={`text-xs mt-0.5 font-mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>{n.date}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* DART 공시 */}
        {selected.disclosures && selected.disclosures.length > 0 && (
          <section className={card}>
            <SectionHeader title="기업 공시 자료 (DART Disclosures)" badge="DART" isDark={isDark} />
            <ul className="space-y-2">
              {selected.disclosures.map((d, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className={`text-xs font-mono shrink-0 w-20 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{d.date}</span>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className={`text-sm hover:underline truncate ${isDark ? "text-blue-400" : "text-blue-700"}`}>{d.title}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 참고 문헌 */}
        {selected.evidence && selected.evidence.length > 0 && (
          <section className={card}>
            <SectionHeader title="자료 출처 (References)" isDark={isDark} />
            <ul className="space-y-2">
              {selected.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`text-xs mt-0.5 font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>[{i + 1}]</span>
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className={`text-sm hover:underline truncate block ${isDark ? "text-blue-400" : "text-blue-700"}`}>{e.title || e.url}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>

      {/* 신뢰도 모달 */}
      {reliabilityOpen && <ReliabilityModal analysis={selected} isDark={isDark} onClose={() => setReliabilityOpen(false)} />}
    </div>
  );
}
