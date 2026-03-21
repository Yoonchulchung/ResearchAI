"use client";

import { Sidebar } from "./Sidebar";
import { NewSessionModal } from "./NewSessionModal";
import { DocStoreModal } from "./DocStoreModal";
import { SummaryProgressProvider } from "@/contexts/SummaryProgressContext";
import { NewSessionModalProvider } from "@/contexts/NewSessionModalContext";
import { DocStoreModalProvider } from "@/contexts/DocStoreModalContext";
import { SidebarProvider } from "@/contexts/SidebarContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
    <NewSessionModalProvider>
      <DocStoreModalProvider>
        <SummaryProgressProvider>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
          <NewSessionModal />
          <DocStoreModal />
        </SummaryProgressProvider>
      </DocStoreModalProvider>
    </NewSessionModalProvider>
    </SidebarProvider>
  );
}
