"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/analytics", label: "Overview" },
  { href: "/settings/analytics/logs", label: "Logs" },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">AI API 사용량 및 비용을 확인합니다.</p>
      </div>

      <div className="flex gap-0 border-b border-slate-200">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
