"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type SummaryProgressStatus = "streaming" | "done" | "error";

export interface SummaryProgressItem {
  sessionId: string;
  topic: string;
  status: SummaryProgressStatus;
}

interface SummaryProgressContextValue {
  items: SummaryProgressItem[];
  register: (sessionId: string, topic: string) => void;
  update: (sessionId: string, status: SummaryProgressStatus) => void;
  dismiss: (sessionId: string) => void;
}

const SummaryProgressContext = createContext<SummaryProgressContextValue | null>(null);

export function useSummaryProgress() {
  const ctx = useContext(SummaryProgressContext);
  if (!ctx) throw new Error("useSummaryProgress must be inside SummaryProgressProvider");
  return ctx;
}

export function SummaryProgressProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SummaryProgressItem[]>([]);

  const register = useCallback((sessionId: string, topic: string) => {
    setItems((prev) => {
      if (prev.some((i) => i.sessionId === sessionId)) {
        return prev.map((i) =>
          i.sessionId === sessionId ? { ...i, topic, status: "streaming" } : i,
        );
      }
      return [...prev, { sessionId, topic, status: "streaming" }];
    });
  }, []);

  const update = useCallback((sessionId: string, status: SummaryProgressStatus) => {
    setItems((prev) =>
      prev.map((i) => (i.sessionId === sessionId ? { ...i, status } : i)),
    );
  }, []);

  const dismiss = useCallback((sessionId: string) => {
    setItems((prev) => prev.filter((i) => i.sessionId !== sessionId));
  }, []);

  const value = useMemo(
    () => ({ items, register, update, dismiss }),
    [items, register, update, dismiss],
  );

  return (
    <SummaryProgressContext.Provider value={value}>
      {children}
    </SummaryProgressContext.Provider>
  );
}
