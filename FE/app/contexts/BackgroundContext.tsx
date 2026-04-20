"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

export type BgSection = "main" | "sessions";
export const DEFAULT_BG = "#F5F7FA";
export type BgMap = Record<BgSection, string>;

interface BackgroundContextValue {
  backgrounds: BgMap;
  setBackground: (section: BgSection, value: string) => void;
}

const defaultBgMap: BgMap = { main: DEFAULT_BG, sessions: DEFAULT_BG };

const BackgroundContext = createContext<BackgroundContextValue>({
  backgrounds: defaultBgMap,
  setBackground: () => {},
});

function storageKey(userId: string) {
  return `app-backgrounds-v3-${userId}`;
}

export function BackgroundProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [backgrounds, setBackgrounds] = useState<BgMap>(defaultBgMap);

  // 유저 변경 시 해당 유저의 배경 로드 (비로그인이면 DEFAULT_BG)
  useEffect(() => {
    if (!user) {
      setBackgrounds(defaultBgMap);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey(user.id));
      if (saved) setBackgrounds({ ...defaultBgMap, ...JSON.parse(saved) });
      else setBackgrounds(defaultBgMap);
    } catch {
      setBackgrounds(defaultBgMap);
    }
  }, [user?.id]);

  const setBackground = (section: BgSection, value: string) => {
    setBackgrounds((prev) => {
      const next = { ...prev, [section]: value };
      if (user) {
        try { localStorage.setItem(storageKey(user.id), JSON.stringify(next)); } catch {}
      }
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
