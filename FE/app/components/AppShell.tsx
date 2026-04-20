"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { NewSessionModal } from "./NewSessionModal";
import { DocStoreModal } from "./DocStoreModal";
import { SummaryProgressProvider } from "@/contexts/SummaryProgressContext";
import { NewSessionModalProvider } from "@/contexts/NewSessionModalContext";
import { DocStoreModalProvider } from "@/contexts/DocStoreModalContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { BackgroundProvider, useBackground, DEFAULT_BG } from "@/contexts/BackgroundContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { backgrounds } = useBackground();
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const bg =
    pathname.startsWith("/sessions") ? backgrounds.sessions :
    pathname.startsWith("/main")     ? backgrounds.main :
    DEFAULT_BG;

  const bgStyle = bg !== DEFAULT_BG ? { background: bg } : undefined;

  return (
    <div className="flex h-screen overflow-hidden mesh-bg" style={bgStyle}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
    <BackgroundProvider>
    <SidebarProvider>
    <NewSessionModalProvider>
      <DocStoreModalProvider>
        <SummaryProgressProvider>
          <AppShellInner>{children}</AppShellInner>
          <NewSessionModal />
          <DocStoreModal />
        </SummaryProgressProvider>
      </DocStoreModalProvider>
    </NewSessionModalProvider>
    </SidebarProvider>
    </BackgroundProvider>
    </ThemeProvider>
  );
}
