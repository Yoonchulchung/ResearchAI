"use client";

import type { TabKey } from "../_hooks/useCompanyDetailData";

interface DetailTabsProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  isDark: boolean;
  hasStock: boolean;
}

export function DetailTabs({ activeTab, setActiveTab, isDark, hasStock }: DetailTabsProps) {
  const tabs = [
    { key: "overview" as const, label: "개요" },
    { key: "jobs" as const, label: "채용공고" },
    { key: "news" as const, label: "뉴스" },
    { key: "stock" as const, label: hasStock ? "주식/재무" : "재무제표" },
    { key: "analysis" as const, label: "핵심 기업분석" },
  ];

  return (
    <nav className="flex items-center gap-6 md:gap-8 overflow-x-auto scrollbar-none py-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={`relative py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
            activeTab === tab.key
              ? isDark ? "text-white" : "text-slate-950"
              : isDark ? "text-white/45 hover:text-white" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {tab.label}
          {activeTab === tab.key ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-sm bg-orange-500" /> : null}
        </button>
      ))}
    </nav>
  );
}
