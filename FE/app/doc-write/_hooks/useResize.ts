import { useCallback, useRef, useState } from "react";

const STORAGE_KEY = "doc-write:split-ratio";

function loadRatio(defaultRatio: number): number {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v !== null) {
      const n = parseFloat(v);
      if (!isNaN(n) && n >= 0.2 && n <= 0.8) return n;
    }
  } catch {}
  return defaultRatio;
}

export function useResize(defaultRatio = 0.5) {
  const [splitRatio, setSplitRatio] = useState(() => loadRatio(defaultRatio));
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0.2), 0.8);
      setSplitRatio(ratio);
    };

    const onUp = () => {
      setIsDragging(false);
      setSplitRatio((prev) => {
        try { sessionStorage.setItem(STORAGE_KEY, String(prev)); } catch {}
        return prev;
      });
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return { splitRatio, containerRef, startResize, isDragging };
}
