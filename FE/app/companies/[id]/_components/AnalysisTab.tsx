"use client";

import { useRouter } from "next/navigation";
import type { CompanyListItem } from "@/lib/api/companies";
import type { CompanyAnalysis } from "@/lib/api/company-analysis";

// ── 역량 SVG 아크 ─────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 80) return { stroke: "#6366f1", text: "#6366f1" };
  if (v >= 65) return { stroke: "#3b82f6", text: "#3b82f6" };
  if (v >= 50) return { stroke: "#f59e0b", text: "#f59e0b" };
  return { stroke: "#94a3b8", text: "#94a3b8" };
}

function ScoreArc({ label, score, isDark }: { label: string; score: number; isDark: boolean }) {
  const r = 26, cx = 34, cy = 34, sw = 5;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(1, score / 100) * circumference;
  const { stroke, text } = scoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={68} height={68} viewBox="0 0 68 68">
        {/* 배경 트랙 */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? "#1e293b" : "#e2e8f0"} strokeWidth={sw} />
        {/* 점수 아크 */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        {/* 점수 텍스트 */}
        <text
          x={cx} y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14}
          fontWeight="800"
          fill={text}
        >
          {score}
        </text>
      </svg>
      <span className={`text-center text-2xs font-semibold leading-tight ${isDark ? "text-slate-400" : "text-slate-600"}`}>
        {label}
      </span>
    </div>
  );
}

function CompetencyScoreGrid({ scores, isDark }: { scores: Record<string, number>; isDark: boolean }) {
  const entries = Object.entries(scores);
  const avg = entries.length ? Math.round(entries.reduce((s, [, v]) => s + v, 0) / entries.length) : 0;
  const { stroke, text } = scoreColor(avg);

  return (
    <div className="space-y-4">
      {/* 평균 헤더 */}
      <div className="flex items-center gap-3">
        <svg width={48} height={48} viewBox="0 0 48 48">
          <circle cx={24} cy={24} r={20} fill="none" stroke={isDark ? "#1e293b" : "#e2e8f0"} strokeWidth={4} />
          <circle
            cx={24} cy={24} r={20}
            fill="none"
            stroke={stroke}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${Math.min(1, avg / 100) * 2 * Math.PI * 20} ${2 * Math.PI * 20}`}
            transform="rotate(-90 24 24)"
          />
          <text x={24} y={24} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight="800" fill={text}>{avg}</text>
        </svg>
        <div>
          <p className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>종합 역량 점수</p>
          <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{entries.length}개 항목 평균 · 100점 만점</p>
        </div>
      </div>
      {/* 항목 그리드 */}
      <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-5 lg:grid-cols-7">
        {entries.map(([key, score]) => (
          <ScoreArc key={key} label={key} score={score} isDark={isDark} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface AnalysisTabProps {
  company: CompanyListItem;
  analysis: CompanyAnalysis | null;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
  mutedPanel: string;
}

export function AnalysisTab({
  company,
  analysis,
  isDark,
  panelClass,
  subtleText,
  mutedPanel,
}: AnalysisTabProps) {
  const router = useRouter();

  if (!analysis) {
    return (
      <div className={`rounded-md border p-8 text-center ${panelClass}`}>
        <p className={`text-sm font-bold ${subtleText}`}>아직 저장된 분석자료가 없습니다.</p>
        <button
          onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
        >
          분석 시작
        </button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      {/* 헤더 */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 ${panelClass}`}>
        <div>
          <h2 className="text-base font-black">핵심 기업분석</h2>
          <p className={`mt-0.5 text-xs ${subtleText}`}>
            {analysis.updatedAt
              ? `최종 분석: ${new Date(analysis.updatedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}`
              : "저장된 분석이 없습니다."}
          </p>
        </div>
        <button
          onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
        >
          분석 페이지에서 보기
        </button>
      </div>

      {/* 한 줄 요약 + 신용등급 */}
      {analysis.summary || analysis.creditRating ? (
        <div className={`rounded-md border p-4 ${panelClass}`}>
          {analysis.summary ? <p className="text-sm leading-relaxed">{analysis.summary}</p> : null}
          {analysis.creditRating ? (
            <div className="mt-3 flex items-center gap-2">
              <span className={`text-xs font-bold ${subtleText}`}>신용등급</span>
              <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                {analysis.creditRating}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* SWOT */}
      {analysis.swot ? (
        <div className="space-y-3">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>SWOT 분석</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(
              [
                {
                  key: "S",
                  label: "Strengths (강점)",
                  sub: "기업의 강점 요인",
                  color: isDark ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40" : "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300",
                  badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )
                },
                {
                  key: "W",
                  label: "Weaknesses (약점)",
                  sub: "보완이 필요한 약점 요인",
                  color: isDark ? "border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40" : "border-rose-200 bg-rose-50/50 hover:border-rose-300",
                  badge: "bg-rose-500/10 text-rose-500 border-rose-500/20",
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )
                },
                {
                  key: "O",
                  label: "Opportunities (기회)",
                  sub: "성장 기회 및 긍정적 시장 변화",
                  color: isDark ? "border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40" : "border-blue-200 bg-blue-50/50 hover:border-blue-300",
                  badge: "bg-blue-500/10 text-blue-500 border-blue-500/20",
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  )
                },
                {
                  key: "T",
                  label: "Threats (위협)",
                  sub: "리스크 및 잠재적 장애 요인",
                  color: isDark ? "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40" : "border-amber-200 bg-amber-50/50 hover:border-amber-300",
                  badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )
                },
              ] as const
            ).map(({ key, label, sub, color, badge, icon }) => (
              <div key={key} className={`rounded-xl border p-4 transition-all duration-300 shadow-xs hover:shadow-md ${color}`}>
                <div className="flex items-center gap-2 mb-3 border-b pb-2 border-slate-200 dark:border-white/10">
                  <span className={`p-1 rounded border ${badge}`}>
                    {icon}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">{label}</h4>
                    <p className="text-[10px] text-slate-400 dark:text-white/40">{sub}</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {(analysis.swot?.[key] ?? []).map((item, i) => (
                    <li key={i} className="text-xs leading-relaxed text-slate-600 dark:text-white/70 flex items-start gap-1.5">
                      <span className="mt-1.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 사업부문 */}
      {analysis.businessSegments?.length ? (
        <div className="space-y-3">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>사업부문</p>

          {/* 매출 비중 통합 시각화 바 */}
          {(() => {
            const segmentsWithShare = analysis.businessSegments.filter((s) => s.revenueShare);
            if (segmentsWithShare.length === 0) return null;

            const parsed = segmentsWithShare.map((seg, idx) => {
              const num = parseFloat(seg.revenueShare!.replace(/[^0-9.]/g, ""));
              return { name: seg.name, originalShare: seg.revenueShare, value: isNaN(num) ? 0 : num, index: idx };
            });
            const sum = parsed.reduce((acc, curr) => acc + curr.value, 0);
            const colors = ["bg-indigo-500", "bg-violet-500", "bg-cyan-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];

            if (sum === 0) return null;

            return (
              <div className={`rounded-xl border p-4 ${panelClass} shadow-xs space-y-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">매출 비중 시각화</span>
                  <span className="text-[10px] text-slate-400">전체 매출 대비 비중</span>
                </div>
                <div className="h-3.5 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                  {parsed.map((seg) => {
                    const pct = (seg.value / sum) * 100;
                    if (pct === 0) return null;
                    const col = colors[seg.index % colors.length];
                    return (
                      <div
                        key={seg.name}
                        className={`h-full ${col} transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${seg.name}: ${seg.originalShare}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                  {parsed.map((seg) => {
                    const col = colors[seg.index % colors.length];
                    return (
                      <div key={seg.name} className="flex items-center gap-1.5 text-xs font-medium">
                        <span className={`w-1.5 h-1.5 rounded-full ${col}`} />
                        <span className="text-slate-700 dark:text-slate-300">{seg.name}</span>
                        <span className={subtleText}>({seg.originalShare})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* 부문별 카드 리스트 */}
          <div className="space-y-2.5">
            {analysis.businessSegments.map((seg, i) => (
              <div key={i} className={`rounded-xl border p-4 transition-all duration-200 hover:shadow-md ${panelClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 border-slate-100 dark:border-white/5">
                  <span className="text-sm font-extrabold text-indigo-500 dark:text-indigo-400">{seg.name}</span>
                  {seg.revenueShare ? (
                    <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                      비중: {seg.revenueShare}
                    </span>
                  ) : null}
                </div>
                {seg.description ? <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-white/70">{seg.description}</p> : null}

                {(seg.mainProducts || seg.subsidiaries?.length) && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2 pt-2 border-t border-slate-50 dark:border-white/5 text-[11px]">
                    {seg.mainProducts && (
                      <div className="flex gap-1.5">
                        <span className={`${subtleText} font-semibold shrink-0`}>핵심 제품:</span>
                        <span className="text-slate-700 dark:text-slate-300">{seg.mainProducts}</span>
                      </div>
                    )}
                    {seg.subsidiaries?.length && (
                      <div className="flex gap-1.5">
                        <span className={`${subtleText} font-semibold shrink-0`}>계열사/법인:</span>
                        <span className="text-slate-700 dark:text-slate-300">{seg.subsidiaries.join(", ")}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 경쟁사 */}
      {analysis.competitors?.length ? (
        <div className="space-y-3">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>경쟁사 분석</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {analysis.competitors.map((comp, i) => {
              const threatColors: Record<string, string> = {
                high: "bg-red-500/10 text-red-500 border-red-500/20",
                medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
                low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
              };
              const threatText: Record<string, string> = { high: "위협: 높음", medium: "위협: 중간", low: "위협: 낮음" };
              const pillsCount = comp.threatLevel === "high" ? 3 : comp.threatLevel === "medium" ? 2 : 1;
              const pillBg = comp.threatLevel === "high" ? "bg-red-500" : comp.threatLevel === "medium" ? "bg-amber-500" : "bg-emerald-500";

              return (
                <div key={i} className={`rounded-xl border p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-md ${panelClass}`}>
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b pb-2 border-slate-100 dark:border-white/5">
                      <div className="min-w-0">
                        {comp.siteUrl ? (
                          <a
                            href={comp.siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-extrabold text-slate-800 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-400 hover:underline underline-offset-4 flex items-center gap-1"
                          >
                            {comp.name}
                            <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-sm font-extrabold text-slate-800 dark:text-white">{comp.name}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((idx) => (
                            <div
                              key={idx}
                              className={`w-1.5 h-3 rounded-2xs transition-colors ${idx <= pillsCount ? pillBg : "bg-slate-200 dark:bg-slate-700"}`}
                            />
                          ))}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${threatColors[comp.threatLevel] ?? threatColors.low}`}>
                          {threatText[comp.threatLevel] ?? comp.threatLevel}
                        </span>
                      </div>
                    </div>

                    {comp.reason ? <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-white/70">{comp.reason}</p> : null}
                  </div>

                  {comp.needed && (
                    <div className={`mt-4 rounded-lg p-2.5 text-xs font-semibold ${isDark ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20" : "bg-indigo-50 text-indigo-700 border border-indigo-100"}`}>
                      <p className="text-[9px] uppercase tracking-wider text-indigo-400 font-bold mb-1">대응 전략</p>
                      <p className="leading-relaxed">{comp.needed}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 미션 / 비전 */}
      {analysis.missionVision ? (
        <div className={`rounded-xl border p-5 relative overflow-hidden ${panelClass} shadow-xs`}>
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <p className={`mb-4 text-xs font-bold uppercase tracking-widest ${subtleText}`}>미션 및 비전</p>

          <div className="grid gap-5 md:grid-cols-2">
            {analysis.missionVision.mission ? (
              <div className="relative pl-6 border-l-2 border-indigo-500 space-y-1">
                <span className="absolute -left-1.5 top-0 text-2xl font-serif text-indigo-400/50 leading-none">“</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Corporate Mission</span>
                <p className="text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-200">
                  {analysis.missionVision.mission}
                </p>
              </div>
            ) : null}

            {analysis.missionVision.vision ? (
              <div className="relative pl-6 border-l-2 border-violet-500 space-y-1">
                <span className="absolute -left-1.5 top-0 text-2xl font-serif text-violet-400/50 leading-none">“</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Future Vision</span>
                <p className="text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-200">
                  {analysis.missionVision.vision}
                </p>
              </div>
            ) : null}
          </div>

          {analysis.missionVision.coreValues?.length ? (
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5 space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">핵심 가치</span>
              <div className="flex flex-wrap gap-2">
                {analysis.missionVision.coreValues.map((v) => (
                  <span
                    key={v}
                    className="rounded-lg bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-500/10 hover:border-indigo-500/30 transition-colors"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {analysis.missionVision.talentProfile ? (
            <div className="mt-4 pt-3 border-t border-slate-50 dark:border-white/5 text-xs">
              <span className={`${subtleText} font-bold`}>추구하는 인재상:</span>{" "}
              <span className="text-slate-700 dark:text-slate-300 leading-relaxed">{analysis.missionVision.talentProfile}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 역량 점수 */}
      {analysis.scores ? (
        <div className="space-y-3">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>인프라 / 역량 평가 점수</p>
          <div className={`rounded-xl border p-5 ${panelClass} shadow-xs`}>
            <CompetencyScoreGrid scores={analysis.scores as unknown as Record<string, number>} isDark={isDark} />
          </div>
        </div>
      ) : null}

      {/* AI 분석 리포트 */}
      {analysis.report ? (
        <div className="space-y-3">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>AI 종합 분석 리포트</p>
          <div className={`rounded-xl border ${panelClass} shadow-xs overflow-hidden`}>
            <div className="border-b px-4 py-2.5 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
              <span className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                심층 분석 리포트 본문
              </span>
            </div>
            <div className="p-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans">{analysis.report}</div>
          </div>
        </div>
      ) : null}

      {/* 최근 뉴스 */}
      {analysis.recentNews?.length ? (
        <div className="space-y-3">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>최근 관련 주요 뉴스</p>
          <div className="grid gap-2.5">
            {analysis.recentNews.slice(0, 6).map((news, i) => (
              <a
                key={i}
                href={news.url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center justify-between rounded-xl border p-3.5 transition-all duration-300 ${panelClass} shadow-2xs hover:shadow-md hover:border-indigo-500/50 dark:hover:border-indigo-500/30 group`}
              >
                <span className="font-semibold text-xs text-slate-700 dark:text-slate-300 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 line-clamp-1 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                  {news.title}
                </span>
                <span className={`ml-4 shrink-0 text-2xs font-mono font-medium ${subtleText} flex items-center gap-1`}>
                  {news.date}
                  <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
