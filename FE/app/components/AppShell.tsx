"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileShell } from "./MobileShell";
import { MarketTicker } from "./MarketTicker";
import { NewSessionModal } from "./NewSessionModal";
import { DocStoreModal } from "./DocStoreModal";
import { SummaryProgressProvider } from "@/contexts/SummaryProgressContext";
import { NewSessionModalProvider } from "@/contexts/NewSessionModalContext";
import { DocStoreModalProvider } from "@/contexts/DocStoreModalContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { BackgroundProvider, useBackground, DEFAULT_BG } from "@/contexts/BackgroundContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

const NO_SHELL_PATHS = ["/login", "/landing"];

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { backgrounds } = useBackground();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  if (pathname === "/" || NO_SHELL_PATHS.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  if (isMobile) {
    return <MobileShell>{children}</MobileShell>;
  }

  const bg =
    pathname.startsWith("/sessions") ? backgrounds.sessions :
    pathname.startsWith("/main")     ? backgrounds.main :
    DEFAULT_BG;

  const bgStyle = bg !== DEFAULT_BG ? { background: bg } : undefined;

  const containerStyle: React.CSSProperties = { height: '100dvh', ...bgStyle };

  return (
    <div className="flex overflow-hidden mesh-bg" style={containerStyle}>
      <div className="no-print"><Sidebar /></div>
      <div className="flex flex-1 min-w-0 flex-col h-full">
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>
        {pathname.startsWith("/stock") && <div className="no-print"><MarketTicker /></div>}
      </div>
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
