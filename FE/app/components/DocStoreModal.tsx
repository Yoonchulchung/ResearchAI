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
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeModal}
      />

      {/* Floating Panel */}
      <div
        style={{ left: collapsed ? "3.5rem" : "15.5rem" }}
        className={`fixed top-4 bottom-4 z-50 w-160 max-w-[calc(100vw-4rem)] bg-white rounded-2xl shadow-2xl shadow-black/15 flex flex-col border border-slate-200/60 transition-all duration-300 ease-out overflow-hidden ${
          isOpen ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-4 pointer-events-none"
        }`}
      >
        {isOpen && <DocStorePage />}
      </div>
    </>
  );
}
