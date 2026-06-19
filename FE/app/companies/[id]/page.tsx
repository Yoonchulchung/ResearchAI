"use client";

import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useCompanyDetailData } from "./_hooks/useCompanyDetailData";
import { DetailHeader } from "./_components/DetailHeader";
import { DetailTabs } from "./_components/DetailTabs";
import { OverviewTab } from "./_components/OverviewTab";
import { JobsTab } from "./_components/JobsTab";
import { NewsTab } from "./_components/NewsTab";
import { AnalysisTab } from "./_components/AnalysisTab";
import { StockChart } from "@/companies/_components/StockChart";
import { InvestorTrading } from "@/companies/_components/InvestorTrading";
import { ShortSellingStatus } from "@/companies/_components/ShortSellingStatus";
import { FinancialSection } from "@/companies/_components/FinancialSection";

export default function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const companyId = decodeURIComponent(params.id);
  const data = useCompanyDetailData(companyId);

  const pageClass = isGlass
    ? "bg-transparent"
    : isDark
      ? "bg-slate-950 text-white"
      : "bg-slate-50 text-slate-950";
  const panelClass = isGlass
    ? "glass-panel border-white/20"
    : isDark
      ? "border-white/10 bg-slate-900"
      : "border-slate-200 bg-white";
  const subtleText = isDark ? "text-white/55" : "text-slate-500";
  const mutedPanel = isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50";

  if (data.loading) {
    return (
      <main className={`h-full overflow-y-auto ${pageClass}`}>
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] items-center justify-center px-4 py-8">
          <div className={`rounded-md border px-5 py-4 text-sm ${panelClass} ${subtleText}`}>
            기업 정보를 불러오는 중...
          </div>
        </div>
      </main>
    );
  }
  if (!data.company) {
    return (
      <main className={`h-full overflow-y-auto ${pageClass}`}>
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] items-center justify-center px-4 py-8">
          <div className={`rounded-md border p-6 text-center ${panelClass}`}>
            <h1 className="text-lg font-black">기업을 찾을 수 없습니다.</h1>
            <p className={`mt-1.5 text-sm ${subtleText}`}>{data.error || "목록에서 다시 선택해 주세요."}</p>
            <button
              onClick={() => router.push("/companies")}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white"
            >
              기업 목록
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`h-full xl:overflow-hidden flex flex-col ${pageClass}`}>
      <div className="mx-auto flex w-full flex-col gap-5 px-4 pt-4 sm:px-6 min-h-full xl:h-full xl:flex-1 xl:min-h-0">
        <div className="shrink-0 flex flex-col gap-5">
          <button
            onClick={() => router.push("/companies")}
            className={`w-fit text-sm font-bold transition-colors ${
              isDark ? "text-white/60 hover:text-white" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            ← 기업 목록
          </button>

          {/* 헤더 */}
          <DetailHeader
            company={data.company}
            analysis={data.analysis}
            isDark={isDark}
            mutedPanel={mutedPanel}
            subtleText={subtleText}
          />

          {/* 탭 및 결측치 크롤링 버튼 */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 gap-4">
            <div className="flex-1 min-w-0">
              <DetailTabs
                activeTab={data.activeTab}
                setActiveTab={data.setActiveTab}
                isDark={isDark}
                hasStock={!!data.company.stockCode}
              />
            </div>
            <button
              onClick={data.handleRefreshMissing}
              disabled={data.refreshing}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors mb-1 ${
                data.refreshing
                  ? "cursor-wait bg-slate-300 text-slate-600"
                  : isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
              }`}
            >
              {data.refreshing ? "재수집 중..." : "결측치 크롤링"}
            </button>
          </div>

          {data.error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {data.error}
            </div>
          ) : null}
        </div>

        {/* 탭 내용 분기 */}
        <div className="xl:flex-1 xl:min-h-0 pb-4 flex flex-col">
        {data.activeTab === "overview" ? (
          <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto pr-2">
            <OverviewTab
              company={data.company}
              analysis={data.analysis}
              isDark={isDark}
              panelClass={panelClass}
              subtleText={subtleText}
              mutedPanel={mutedPanel}
            />
          </div>
        ) : data.activeTab === "jobs" ? (
          <div className="xl:flex-1 xl:min-h-0 xl:overflow-hidden pr-2">
            <JobsTab
              company={data.company}
              jobPostings={data.jobPostings}
              jobsLoading={data.jobsLoading}
              jobSearchLoading={data.jobSearchLoading}
              handleJobSearch={data.handleJobSearch}
              selectedJobTypes={data.selectedJobTypes}
              toggleJobType={data.toggleJobType}
              isDark={isDark}
              panelClass={panelClass}
              subtleText={subtleText}
              mutedPanel={mutedPanel}
            />
          </div>
        ) : data.activeTab === "news" ? (
          <div className="xl:flex-1 xl:min-h-0 xl:overflow-hidden">
            <NewsTab
              company={data.company}
              news={data.news}
              newsLoading={data.newsLoading}
              newsFetched={data.newsFetched}
              newsHasMore={data.newsHasMore}
              savedNews={data.savedNews}
              savedNewsLoaded={data.savedNewsLoaded}
              handleFetchNews={data.handleFetchNews}
              handleFetchMoreNews={data.handleFetchMoreNews}
              loadSavedNews={data.loadSavedNews}
              companyId={companyId}
              isDark={isDark}
              panelClass={panelClass}
              subtleText={subtleText}
            />
          </div>
        ) : data.activeTab === "stock" ? (
          <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto flex flex-col xl:flex-row gap-4 items-start pr-2 custom-scrollbar">
            {/* 좌측: 주가 차트 */}
            <div className="w-full xl:flex-1 xl:min-w-0 xl:h-full xl:sticky xl:top-0">
              {data.company.stockCode ? (
                <StockChart
                  companyId={companyId}
                  financials={data.analysis?.multiYearFinancials ?? []}
                  disclosures={data.analysis?.disclosures ?? []}
                  isDark={isDark}
                  panelClass={panelClass}
                  mutedPanel={mutedPanel}
                  subtleText={subtleText}
                />
              ) : (
                <div className={`rounded-md border p-6 text-center ${panelClass} ${subtleText}`}>
                  상장된 주식 코드가 없어 차트를 제공하지 않습니다.
                </div>
              )}
            </div>

            {/* 우측: 기타 지표 및 재무 정보 */}
            <div className="w-full xl:w-[480px] 2xl:w-[560px] xl:max-w-[38%] flex flex-col gap-4 shrink-0">
              {data.company.stockCode ? (
                <>
                  <InvestorTrading companyId={companyId} isDark={isDark} panelClass={panelClass} subtleText={subtleText} />
                  <ShortSellingStatus companyId={companyId} isDark={isDark} panelClass={panelClass} subtleText={subtleText} />
                </>
              ) : null}
              {data.analysis?.multiYearFinancials?.length ? (
                <FinancialSection
                  companyId={companyId}
                  data={data.analysis.multiYearFinancials}
                  isDark={isDark}
                  panelClass={panelClass}
                  subtleText={subtleText}
                />
              ) : (
                <div className={`rounded-md border p-6 text-center ${panelClass} ${subtleText}`}>
                  등록된 재무제표 정보가 없습니다.
                </div>
              )}
            </div>
          </div>
        ) : data.activeTab === "analysis" ? (
          <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto pr-2">
            <AnalysisTab
              company={data.company}
              analysis={data.analysis}
              isDark={isDark}
              panelClass={panelClass}
              subtleText={subtleText}
              mutedPanel={mutedPanel}
            />
          </div>
        ) : (
          <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto pr-2">
            <section className={`rounded-md border p-6 text-center ${panelClass}`}>
              <h2 className="text-base font-black">알 수 없는 탭</h2>
            </section>
          </div>
        )}
        </div>
      </div>
    </main>
  );
}
