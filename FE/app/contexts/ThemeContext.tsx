"use client";

import { createContext, useContext, useState, useEffect } from "react";

export type Theme = "light" | "dark";
export type UiStyle = "classic" | "glass";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  uiStyle: UiStyle;
  setUiStyle: (u: UiStyle) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  uiStyle: "glass",
  setUiStyle: () => {},
});

const STORAGE_KEY = "app-theme";
const UI_STORAGE_KEY = "app-uistyle";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [uiStyle, setUiStyleState] = useState<UiStyle>("glass");

  useEffect(() => {
    const savedTheme = (localStorage.getItem(STORAGE_KEY) as Theme) ?? "light";
    setThemeState(savedTheme);
    document.documentElement.dataset.theme = savedTheme;

    const savedUi = (localStorage.getItem(UI_STORAGE_KEY) as UiStyle) ?? "glass";
    setUiStyleState(savedUi);
    document.documentElement.dataset.ui = savedUi;
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem(STORAGE_KEY, t);
  };

  const setUiStyle = (u: UiStyle) => {
    setUiStyleState(u);
    document.documentElement.dataset.ui = u;
    localStorage.setItem(UI_STORAGE_KEY, u);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, uiStyle, setUiStyle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
