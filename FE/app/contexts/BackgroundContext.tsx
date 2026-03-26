"use client";

import { createContext, useContext, useState, useEffect } from "react";

export type BgSection = "main" | "sessions";
export const DEFAULT_BG = "#F5F7FA";
export type BgMap = Record<BgSection, string>;

interface BackgroundContextValue {
  backgrounds: BgMap;
  setBackground: (section: BgSection, value: string) => void;
}

const defaultBgMap: BgMap = { main: DEFAULT_BG, sessions: DEFAULT_BG };
const STORAGE_KEY = "app-backgrounds-v3";

const BackgroundContext = createContext<BackgroundContextValue>({
  backgrounds: defaultBgMap,
  setBackground: () => {},
});

export function BackgroundProvider({ children }: { children: React.ReactNode }) {
  const [backgrounds, setBackgrounds] = useState<BgMap>(defaultBgMap);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setBackgrounds({ ...defaultBgMap, ...JSON.parse(saved) });
    } catch {}
  }, []);

  const setBackground = (section: BgSection, value: string) => {
    setBackgrounds((prev) => {
      const next = { ...prev, [section]: value };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return (
    <BackgroundContext.Provider value={{ backgrounds, setBackground }}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  return useContext(BackgroundContext);
}
