"use client";

import { useRouter } from "next/navigation";
import type { CompanyListItem } from "@/lib/api/companies";
import type { CompanyAnalysis, YearlyFinancial } from "@/lib/api/company-analysis";

interface OverviewTabProps {
  company: CompanyListItem;
  analysis: CompanyAnalysis | null;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
  mutedPanel: string;
}

function valueOrDash(value?: string | null) {
  return value?.trim() || "-";
}

function formatEmployees(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const num = parseInt(value.replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return value;
  return `${num.toLocaleString("ko-KR")}명`;
}

function formatFoundedDate(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const m = value.match(/(\d{4})/);
  if (!m) return value;
  const year = parseInt(m[1], 10);
  if (year < 1800 || year > 2100) return value;
  const rest = value.replace(m[1], "").replace(/[-./]/g, "").trim();
  if (rest.length >= 4) {
    const month = parseInt(rest.slice(0, 2), 10);
    const day = parseInt(rest.slice(2, 4), 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}년 ${month}월 ${day}일`;
    }
  }
  return `${year}년`;
}

function latestRevenue(analysis: CompanyAnalysis | null, company: CompanyListItem): string | null {
  if (company.revenue?.trim()) return company.revenue;
  const sorted = analysis?.multiYearFinancials?.slice().sort((a, b) => b.year - a.year);
  return sorted?.[0]?.revenueFormatted ?? null;
}

function infoRows(company: CompanyListItem, analysis: CompanyAnalysis | null): [string, string | null | undefined][] {
  return [
    ["산업(업종)", analysis?.industry ?? company.industry],
    ["기업 형태", analysis?.companySize ?? company.companyType],
    ["대표자", analysis?.ceoName ?? company.ceoName],
    ["사원수", formatEmployees(analysis?.employees ?? company.employees)],
    ["매출액", latestRevenue(analysis, company)],
    ["설립 년도", formatFoundedDate(analysis?.foundedDate ?? company.foundedDate)],
    ["주소지", analysis?.address ?? company.address],
    ["홈페이지", analysis?.homeUrl ?? company.homeUrl],
  ];
}

function latestPointers(analysis: CompanyAnalysis | null) {
  if (!analysis) return [];
  const points: string[] = [];
  if (analysis.industry) points.push(`${analysis.industry} 산업 동향과 기업 포지션을 함께 확인해 보세요.`);
  if (analysis.summary) points.push(analysis.summary);
  if (analysis.swot?.S?.[0]) points.push(`강점: ${analysis.swot.S[0]}`);
  if (analysis.swot?.O?.[0]) points.push(`기회: ${analysis.swot.O[0]}`);
  if (analysis.report) points.push(analysis.report.split("\n").find((line) => line.trim().length > 20)?.trim() ?? analysis.report.slice(0, 160));
  return points.filter(Boolean).slice(0, 4);
}

function disclosurePdfViewerUrl(url: string, title: string) {
  const params = new URLSearchParams({ url, title });
  return `/companies/disclosures/pdf-viewer?${params.toString()}`;
}

function FinancialChart({
  data,
  isDark,
  subtleText,
  panelClass,
}: {
  data: YearlyFinancial[];
  isDark: boolean;
  subtleText: string;
  panelClass: string;
}) {
  const sorted = [...data].sort((a, b) => a.year - b.year);
  const maxVal = Math.max(...sorted.flatMap((d) => [d.revenue ?? 0, d.operatingProfit ?? 0, d.netIncome ?? 0]));
  if (maxVal === 0) return null;

  const pct = (val: number | null) =>
    val == null || val === 0 ? 0 : Math.max(5, Math.round((Math.abs(val) / maxVal) * 100));

  const metrics = [
    { key: "revenue" as const, color: isDark ? "#818cf8" : "#4f46e5", label: "매출액" },
    { key: "operatingProfit" as const, color: isDark ? "#34d399" : "#059669", label: "영업이익" },
    { key: "netIncome" as const, color: isDark ? "#fb923c" : "#ea580c", label: "당기순이익" },
  ];

  return (
    <div className={`rounded-md border p-3 ${panelClass}`}>
      {/* 범례 */}
      <div className="mb-3 flex gap-3">
        {metrics.map((m) => (
          <div key={m.key} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: m.color }} />
            <span className={`text-xs ${subtleText}`}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* 바 차트 */}
      <div className="flex items-end gap-4">
        {sorted.map((d) => (
          <div key={d.year} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-16 w-full items-end justify-center gap-1">
              {metrics.map((m) => (
                <div
                  key={m.key}
                  className="w-3 shrink-0 rounded-sm transition-all"
                  style={{ height: `${pct(d[m.key])}%`, background: m.color, opacity: 0.85 }}
                />
              ))}
            </div>
            <span className={`text-xs font-semibold ${subtleText}`}>{d.year}년</span>
          </div>
        ))}
      </div>

      {/* 수치 */}
      <div className={`mt-3 border-t pt-2 ${isDark ? "border-white/10" : "border-slate-100"}`}>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={`pb-1 text-left font-semibold ${subtleText}`}>연도</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>매출액</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>영업이익</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>순이익</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>영업이익률</th>
            </tr>
          </thead>
          <tbody>
            {[...sorted].reverse().map((f) => (
              <tr key={f.year} className={`border-t ${isDark ? "border-white/5" : "border-slate-50"}`}>
                <td className="py-0.5 font-bold">{f.year}년</td>
                <td className={`py-0.5 text-right ${subtleText}`}>{f.revenueFormatted ?? "-"}</td>
                <td className={`py-0.5 text-right ${subtleText}`}>{f.operatingProfitFormatted ?? "-"}</td>
                <td className={`py-0.5 text-right ${subtleText}`}>{f.netIncomeFormatted ?? "-"}</td>
                <td className={`py-0.5 text-right ${subtleText}`}>
                  {f.operatingMargin != null ? `${f.operatingMargin.toFixed(1)}%` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OverviewTab({
  company,
  analysis,
  isDark,
  panelClass,
  subtleText,
  mutedPanel,
}: OverviewTabProps) {
  const router = useRouter();
  const rows = infoRows(company, analysis);
  const pointers = latestPointers(analysis);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>한 줄 소개</p>
        <p className="mt-2 text-base leading-relaxed">
          {analysis?.summary ?? company.analysisSummary ?? `${company.name}의 기업 정보를 확인합니다.`}
        </p>
      </div>

      <div className={`rounded-md border p-4 ${panelClass}`}>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {rows.map(([label, value]) => {
            const isUrl = label === "홈페이지" && value && value !== "-";
            return (
              <div key={label} className="grid grid-cols-[5.5rem_1fr] items-start gap-2 text-sm">
                <span className={subtleText}>{label}</span>
                {isUrl ? (
                  <a href={value!} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
                    {value}
                  </a>
                ) : (
                  <span className="break-words">{valueOrDash(value)}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className={`mt-4 text-xs ${subtleText}`}>
          각 기업이 공개한 정보와 수집 가능한 외부 데이터를 활용하여 제공합니다.
        </div>
      </div>

      {/* DART 재무 데이터 차트 */}
      {analysis?.multiYearFinancials?.length ? (
        <section className="space-y-3">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>DART 재무 데이터</p>
          <FinancialChart data={analysis.multiYearFinancials} isDark={isDark} subtleText={subtleText} panelClass={panelClass} />
        </section>
      ) : null}

      {/* 최근 공시 */}
      {analysis?.disclosures?.length ? (
        <section className="space-y-2">
          <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>최근 공시</p>
          <div className="space-y-1.5">
            {analysis.disclosures.slice(0, 5).map((d) => (
              <div
                key={d.url ?? d.title}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${panelClass} ${
                  isDark ? "hover:bg-white/10" : "hover:bg-slate-50"
                }`}
              >
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                >
                  {d.title}
                </a>
                <span className={`shrink-0 text-xs ${subtleText}`}>{d.date}</span>
                <a
                  href={disclosurePdfViewerUrl(d.url, d.title)}
                  target="_blank"
                  rel="noreferrer"
                  title="브라우저에서 PDF 열기"
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                    isDark
                      ? "bg-white/10 text-white/75 hover:bg-white/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  PDF 열기
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black">이 기업 최신 분석자료</h2>
          <button
            onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
          >
            {company.hasAnalysis ? "핵심 분석 보기" : "기업 분석 시작"}
          </button>
        </div>

        {pointers.length ? (
          <div className="space-y-2 text-sm leading-relaxed">
            {pointers.map((point, index) => (
              <p key={`${point}-${index}`}>• {point}</p>
            ))}
          </div>
        ) : (
          <div className={`rounded-md border p-4 ${mutedPanel}`}>
            <p className={`text-sm ${subtleText}`}>아직 저장된 분석자료가 없습니다.</p>
          </div>
        )}

        {analysis?.summary ? (
          <div className="rounded-md bg-indigo-50 p-4 text-sm leading-relaxed text-slate-800 dark:bg-indigo-500/10 dark:text-indigo-100">
            {analysis.summary}
          </div>
        ) : null}
      </section>
    </section>
  );
}
