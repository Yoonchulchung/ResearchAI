"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useJobPostings } from "./_hooks/useJobPostings";
import { useJobScraping } from "./_hooks/useJobScraping";
import { useTheme } from "@/contexts/ThemeContext";
import { JobHeader } from "./_components/JobHeader";
import { JobFilters } from "./_components/JobFilters";
import { JobList } from "./_components/JobList";
import { JobDetail } from "./_components/JobDetail";
import { JobCalendar } from "./_components/JobCalendar";

function JobPostingPageContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");

  const posts = useJobPostings(jobId);
  const scraping = useJobScraping(posts.reload);

  const companyTypeOptions = posts.filterOptions.companyTypes;
  const categoryOptions = posts.filterOptions.categories;

  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  return (
    <div className={`h-full flex flex-col overflow-hidden transition-all ${isGlass ? "p-3 bg-transparent" : isDark ? "bg-slate-900 text-white" : "bg-[#F4F5F7] text-slate-900"}`}>
      <div className={isGlass ? `glass-panel rounded-2xl shadow-xl border overflow-hidden flex-1 flex flex-col min-h-0 ${isDark ? "border-white/20" : "border-black/5"}` : "flex-1 flex flex-col min-h-0 overflow-hidden"}>
        <JobHeader
          total={posts.total}
          selected={posts.selected}
          clearSelected={posts.clearSelected}
          status={scraping.status}
          scrapeLoading={scraping.scrapeLoading}
          scrapeSource={scraping.scrapeSource}
          setScrapeSource={scraping.setScrapeSource}
          linkareerJobType={scraping.linkareerJobType}
          setLinkareerJobType={scraping.setLinkareerJobType}
          handleStart={scraping.handleStart}
          handleStop={scraping.handleStop}
          isHeaderHidden={posts.isHeaderHidden}
        />

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: list + filters */}
          <div
            className={`${posts.selected ? "hidden md:flex" : "flex"} flex-col w-full md:w-[420px] shrink-0 border-r ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200/80 bg-white"} overflow-hidden z-0`}
          >
            <JobFilters
              sourceFilter={posts.sourceFilter}
              onSourceChange={posts.handleSourceChange}
              search={posts.search}
              setSearch={posts.setSearch}
              sortOrder={posts.sortOrder}
              setSortOrder={posts.setSortOrder}
              typeFilter={posts.typeFilter}
              setTypeFilter={posts.setTypeFilter}
              companyTypeFilter={posts.companyTypeFilter}
              setCompanyTypeFilter={posts.setCompanyTypeFilter}
              categoryFilter={posts.categoryFilter}
              setCategoryFilter={posts.setCategoryFilter}
              companyTypeOptions={companyTypeOptions}
              categoryOptions={categoryOptions}
              isFiltersHidden={posts.isFiltersHidden}
            />
            <JobList
              items={posts.items}
              loading={posts.loading}
              selected={posts.selected}
              onSelect={posts.selectPosting}
              onToggleFavorite={posts.toggleFavorite}
              onScroll={posts.handleListScroll}
              loaderRef={posts.loaderRef}
              listItemRefs={posts.listItemRefs}
            />
          </div>

          {/* Right: detail or calendar */}
          {posts.selected ? (
            <JobDetail
              selected={posts.selected}
              detailLoading={posts.detailLoading}
              onToggleFavorite={posts.toggleFavorite}
              onScroll={posts.handleDetailScroll}
            />
          ) : (
            <div className={`hidden md:flex flex-1 ${isDark ? "bg-slate-900" : "bg-[#F8F9FA]"}`}>
              <JobCalendar
                calendarMonth={posts.calendarMonth}
                moveCalendarMonth={posts.moveCalendarMonth}
                popularCategoryFilter={posts.popularCategoryFilter}
                setPopularCategoryFilter={posts.setPopularCategoryFilter}
                popularLoading={posts.popularLoading}
                popularPostings={posts.popularPostings}
                visiblePopularPostings={posts.visiblePopularPostings}
                calendarDays={posts.calendarDays}
                calendarEventsByDate={posts.calendarEventsByDate}
                onSelectPosting={posts.selectPosting}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JobPostingPage() {
  return (
    <Suspense fallback={<div className="h-full bg-slate-50 dark:bg-slate-900" />}>
      <JobPostingPageContent />
    </Suspense>
  );
}
