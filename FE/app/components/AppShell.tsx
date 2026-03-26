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

  const bg =
    pathname.startsWith("/sessions") ? backgrounds.sessions :
    pathname.startsWith("/main")     ? backgrounds.main :
    DEFAULT_BG;

  // DEFAULT_BG일 때는 인라인 스타일을 쓰지 않아 CSS --background 변수(다크 모드 포함)가 적용됨
  const bgStyle = bg !== DEFAULT_BG ? { background: bg } : undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-[--background]" style={bgStyle}>
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
