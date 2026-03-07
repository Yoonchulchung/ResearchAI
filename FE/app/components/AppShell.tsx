"use client";

import { Sidebar } from "./Sidebar";
import { ResearchQueueProvider } from "@/contexts/ResearchQueueContext";
import { SummaryProgressProvider } from "@/contexts/SummaryProgressContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ResearchQueueProvider>
      <SummaryProgressProvider>
        <div className="flex h-screen overflow-hidden bg-[var(--background)]">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </SummaryProgressProvider>
    </ResearchQueueProvider>
  );
}
