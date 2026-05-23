"use client";

import type { CompanyAnalysis } from "@/lib/api/company-analysis";

interface Props {
  filteredCompanies: CompanyAnalysis[];
  selected: CompanyAnalysis | null;
  loadingList: boolean;
  isGlass: boolean;
  isDark: boolean;
  onSelect: (key: string) => void;
  onDelete: (key: string) => void;
}

export function CompanyList({ filteredCompanies, selected, loadingList, isGlass, isDark, onSelect, onDelete }: Props) {
  return (
    <div className={`w-full md:w-72 shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r ${selected ? "hidden md:block" : "flex-1 md:flex-none"} ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}>
      {loadingList ? (
        <div className={`p-5 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>데이터 불러오는 중...</div>
      ) : filteredCompanies.length === 0 ? (
        <div className={`p-6 text-sm text-center border-b ${isDark ? "text-slate-500 border-slate-700" : "text-slate-400 border-slate-200"}`}>
          해당하는 데이터가 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {filteredCompanies.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.companyKey)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selected?.companyKey === c.companyKey
                    ? isDark ? "bg-slate-700/50 border-l-4 border-blue-500" : "bg-blue-50/50 border-l-4 border-blue-700"
                    : isDark ? "hover:bg-slate-700/30 border-l-4 border-transparent" : "hover:bg-slate-50 border-l-4 border-transparent"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>{c.companyName}</span>
                  <div
                    role="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(c.companyKey); }}
                    className={`text-xs px-1 hover:text-red-600 ${isDark ? "text-slate-500" : "text-slate-400"}`}
                    title="삭제"
                  >
                    ✕
                  </div>
                </div>
                <p className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  {new Date(c.updatedAt).toLocaleDateString("ko-KR")}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
