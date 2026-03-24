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
    const POPUP_H = 400; // estimated max height

    const rect = cardEl.getBoundingClientRect();

    // 가장 가까운 fixed 컨테이너 경계 구하기
    let containerRight = window.innerWidth - 12;
    let containerTop = 0;
    let el: HTMLElement | null = cardEl.parentElement;
    while (el) {
      const pos = window.getComputedStyle(el).position;
      if (pos === "fixed" || pos === "absolute") {
        const cr = el.getBoundingClientRect();
        containerRight = cr.right - 12;
        containerTop = cr.top + 8;
        break;
      }
      el = el.parentElement;
    }

    const left = Math.min(Math.max(rect.left, 8), containerRight - POPUP_W);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > 280
      ? rect.bottom + 6
      : Math.max(containerTop, rect.top - POPUP_H - 6);

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
