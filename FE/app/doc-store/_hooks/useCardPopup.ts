import { useEffect, useRef, useState } from "react";
import type { SavedDocument } from "@/lib/api/documents";
import type { Experience } from "@/lib/api/experiences";
import type { ActivePopup } from "../_types";

export function useCardPopup() {
  const [activePopup, setActivePopup] = useState<ActivePopup>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPopup = (
    kind: "doc" | "exp",
    data: SavedDocument | Experience,
    cardEl: HTMLDivElement,
  ) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    const POPUP_W = 360;
    const rect = cardEl.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - POPUP_W - 12);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > 280 ? rect.bottom + 6 : rect.top - 6;
    const popup = { kind, data, top, left, width: POPUP_W } as ActivePopup;
    setActivePopup(popup);
    requestAnimationFrame(() => requestAnimationFrame(() => setPopupVisible(true)));
  };

  const closePopup = () => {
    setPopupVisible(false);
    closeTimerRef.current = setTimeout(() => setActivePopup(null), 200);
  };

  useEffect(() => {
    if (!activePopup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePopup(); };
    const onClick = () => closePopup();
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePopup]);

  return { activePopup, popupVisible, openPopup, closePopup };
}
