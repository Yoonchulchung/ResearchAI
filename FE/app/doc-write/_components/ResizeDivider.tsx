"use client";

import { useTheme } from "@/contexts/ThemeContext";

interface Props {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
}

export function ResizeDivider({ onMouseDown, isDragging }: Props) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <div
      onMouseDown={onMouseDown}
      className={`w-1.5 shrink-0 flex items-center justify-center cursor-col-resize group relative transition-colors ${
        isDragging
          ? dark ? "bg-slate-700" : "bg-indigo-200"
          : dark ? "bg-slate-800" : "bg-slate-200/60"
      } ${dark ? "hover:bg-slate-700" : "hover:bg-indigo-100"}`}
    >
      <div
        className={`w-0.5 h-10 rounded-full transition-colors ${
          isDragging
            ? dark ? "bg-slate-500" : "bg-indigo-400"
            : dark ? "bg-slate-600 group-hover:bg-slate-500" : "bg-slate-300 group-hover:bg-indigo-300"
        }`}
      />
    </div>
  );
}
