"use client";

import { useEffect, useRef } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function ScrollReveal({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 이미 뷰포트에 보이는 요소는 애니메이션 없이 그대로 표시
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.95) return;

    el.setAttribute("data-scroll-hidden", "");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.removeAttribute("data-scroll-hidden");
          el.setAttribute("data-scroll-revealed", "");
          observer.disconnect();
        }
      },
      { threshold: 0.04, rootMargin: "0px 0px -16px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
