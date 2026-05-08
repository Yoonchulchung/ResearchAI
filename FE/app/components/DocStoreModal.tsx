"use client";

import { useEffect } from "react";
import { useDocStoreModal } from "@/contexts/DocStoreModalContext";
import { useSidebar } from "@/contexts/SidebarContext";
import DocStorePage from "@/doc-store/page";

export function DocStoreModal() {
  const { isOpen, closeModal } = useDocStoreModal();
  const { collapsed } = useSidebar();

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeModal]);

  // body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-300 backdrop-blur-sm bg-slate-900/20 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeModal}
      />

      {/* Floating Panel — 모바일: 전체화면, 데스크탑: 사이드바 너비만큼 offset */}
      <div
        style={{ "--panel-left": collapsed ? "4.5rem" : "16.5rem" } as React.CSSProperties}
        className={`fixed top-0 bottom-0 left-0 md:top-4 md:bottom-4 md:left-(--panel-left) z-50 w-full md:w-160 md:max-w-[calc(100vw-5rem)] glass-panel md:rounded-2xl shadow-2xl shadow-black/15 flex flex-col transition-all duration-300 ease-out overflow-hidden ${
          isOpen ? "opacity-100 translate-x-0 scale-100 pointer-events-auto" : "opacity-0 -translate-x-4 scale-95 pointer-events-none"
        }`}
      >
        {isOpen && <DocStorePage />}
      </div>
    </>
  );
}
