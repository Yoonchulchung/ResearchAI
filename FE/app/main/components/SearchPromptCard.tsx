"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isNearScrollBottom } from "@/lib/scroll-guards";

export function SearchPromptCard() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [isHidden, setIsHidden] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;

    const findScrollParent = (el: Element | null): Element | null => {
      if (!el || el === document.body) return null;
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
      return findScrollParent(el.parentElement);
    };

    const scrollEl = findScrollParent(wrapperRef.current);
    if (!scrollEl) return;

    const handleScroll = () => {
      if (window.innerWidth >= 768) return;
      const scrollTop = scrollEl.scrollTop;
      if (isNearScrollBottom(scrollEl)) {
        lastScrollTopRef.current = scrollTop;
        return;
      }
      const delta = scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      if (Math.abs(delta) < 4) return;

      if (delta < 0) setIsHidden(false);
      else if (delta > 0 && scrollTop > 60) setIsHidden(true);
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearch = () => {
    if (!topic.trim()) return;
    router.push(`/main/search?q=${encodeURIComponent(topic.trim())}`);
  };

  const handleStart = () => {
    if (!topic.trim()) return;
    sessionStorage.setItem("dashboard-topic", topic.trim());
    router.push("/sessions/new");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`overflow-hidden transition-all duration-200 ease-out ${
        isHidden
          ? "max-md:max-h-0 max-md:opacity-0 max-md:pointer-events-none"
          : "max-md:max-h-40 opacity-100"
      }`}
    >
      <div className="glass-panel p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center shadow-lg min-w-0 overflow-hidden">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 2025년 AI 에이전트 기술 트렌드"
          className="w-full min-w-0 sm:flex-1 px-3 sm:px-4 py-3 text-sm rounded-xl bg-white/70 border border-slate-200 placeholder-slate-400 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary focus:bg-white transition-all shadow-inner"
        />
      </div>
    </div>
  );
}
