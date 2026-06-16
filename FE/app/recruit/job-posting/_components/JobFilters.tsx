"use client";

import { SOURCE_LABELS } from "../_constants";

interface JobFiltersProps {
  sourceFilter: string;
  onSourceChange: (src: string) => void;
  search: string;
  setSearch: (s: string) => void;
  sortOrder: "latest" | "deadline";
  setSortOrder: (o: "latest" | "deadline") => void;
  typeFilter: string;
  setTypeFilter: (t: string) => void;
  companyTypeFilter: string;
  setCompanyTypeFilter: (ct: string) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  companyTypeOptions: string[];
  categoryOptions: string[];
  isFiltersHidden: boolean;
}

export function JobFilters({
  sourceFilter,
  onSourceChange,
  search,
  setSearch,
  sortOrder,
  setSortOrder,
  typeFilter,
  setTypeFilter,
  companyTypeFilter,
  setCompanyTypeFilter,
  categoryFilter,
  setCategoryFilter,
  companyTypeOptions,
  categoryOptions,
  isFiltersHidden,
}: JobFiltersProps) {
  return (
    <div className="shrink-0 p-4 border-b border-slate-200/80 flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-950/20 dark:border-slate-800">
      {/* Source tabs — desktop only */}
      <div className="hidden md:flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {(["", "favorite", "linkareer", "jobkorea", "catch", "jobplanet", "jobda"] as const).map((src) => (
          <button
            key={src}
            onClick={() => onSourceChange(src)}
            className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors border ${
              sourceFilter === src
                ? "bg-white border-indigo-200 text-indigo-700 dark:bg-slate-800 dark:border-indigo-900 dark:text-indigo-300"
                : "bg-transparent border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
            }`}
          >
            {SOURCE_LABELS[src]}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="기업명, 공고명, 지역, 직무 검색"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      {/* Sort order */}
      <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 border border-slate-200/60 p-1 dark:bg-slate-950/40 dark:border-slate-800">
        {(
          [
            ["latest", "최신순"],
            ["deadline", "마감순"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSortOrder(value)}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
              sortOrder === value
                ? "bg-white text-slate-800 border border-slate-200/50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border border-transparent dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Collapsible filters */}
      <div
        className={`md:contents overflow-hidden transition-all duration-200 ease-out ${
          isFiltersHidden ? "max-md:max-h-0 max-md:opacity-0 max-md:pointer-events-none" : "max-md:max-h-64 max-md:opacity-100"
        }`}
      >
        {/* Type filter */}
        <div className="flex p-1 rounded-md bg-slate-100 border border-slate-200/60 overflow-x-auto scrollbar-hide dark:bg-slate-950/40 dark:border-slate-800">
          {(["", "신입", "인턴", "신입/인턴", "경력"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 flex-1 px-2 py-1.5 text-[13px] font-bold rounded-md transition-all whitespace-nowrap ${
                typeFilter === t
                  ? "bg-white text-slate-800 border border-slate-200/50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border border-transparent dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5"
              }`}
            >
              {t === "" ? "전체" : t}
            </button>
          ))}
        </div>

        {/* Company type multi-select */}
        {companyTypeOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {companyTypeOptions.map((c) => {
              const arr = companyTypeFilter ? companyTypeFilter.split(",") : [];
              const isSelected = arr.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => {
                    if (isSelected) {
                      setCompanyTypeFilter(arr.filter((x) => x !== c).join(","));
                    } else {
                      setCompanyTypeFilter([...arr, c].join(","));
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-sm border transition-all ${
                    isSelected
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] dark:bg-indigo-950/50 dark:border-indigo-900 dark:text-indigo-300"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 dark:bg-slate-800/40 dark:border-slate-700/80 dark:text-slate-300 dark:hover:bg-slate-850 dark:hover:text-white"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {/* Category dropdown */}
        {categoryOptions.length > 0 && (
          <div className="mt-1">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer appearance-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.75rem center",
              }}
            >
              <option value="">직무분야 전체</option>
              {categoryOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
