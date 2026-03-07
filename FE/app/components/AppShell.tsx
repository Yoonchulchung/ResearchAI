"use client";

import { Sidebar } from "./Sidebar";
import { SummaryProgressProvider } from "@/contexts/SummaryProgressContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SummaryProgressProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--background)]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </SummaryProgressProvider>
  );
}
