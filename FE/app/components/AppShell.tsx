"use client";

import { Sidebar } from "./Sidebar";
import { NewSessionModal } from "./NewSessionModal";
import { SummaryProgressProvider } from "@/contexts/SummaryProgressContext";
import { NewSessionModalProvider } from "@/contexts/NewSessionModalContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NewSessionModalProvider>
      <SummaryProgressProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <NewSessionModal />
      </SummaryProgressProvider>
    </NewSessionModalProvider>
  );
}
