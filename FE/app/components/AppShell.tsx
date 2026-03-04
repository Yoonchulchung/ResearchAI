"use client";

import { Sidebar } from "./Sidebar";
import { ResearchQueueProvider } from "../contexts/ResearchQueueContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ResearchQueueProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </ResearchQueueProvider>
  );
}
