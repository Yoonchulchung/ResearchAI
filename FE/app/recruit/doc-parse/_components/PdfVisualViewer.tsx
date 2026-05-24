"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  file: string;
  onPageChange: (page: number) => void;
  onAnalyzePage: (page: number) => void;
  scrollRequest: { page: number; id: number } | null;
  disabled?: boolean;
}

export default function PdfVisualViewer({ file, onPageChange, onAnalyzePage, scrollRequest, disabled }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const visiblePageRef = useRef(-1);

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width - 32)));
    ro.observe(containerRef.current);
    setWidth(Math.floor(containerRef.current.clientWidth - 32));
    return () => ro.disconnect();
  }, []);

  const updateCurrentPage = useCallback(() => {
    const root = containerRef.current;
    if (!root || !numPages) return;

    const rootRect = root.getBoundingClientRect();
    const focusY = rootRect.top + rootRect.height * 0.38;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    pageRefs.current.slice(0, numPages).forEach((page, index) => {
      if (!page) return;
      const rect = page.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, rootRect.top);
      const visibleBottom = Math.min(rect.bottom, rootRect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      if (visibleHeight <= 0) return;

      const containsFocus = rect.top <= focusY && rect.bottom >= focusY;
      const edgeDistance = containsFocus
        ? 0
        : Math.min(Math.abs(rect.top - focusY), Math.abs(rect.bottom - focusY));
      const score = edgeDistance - visibleHeight * 0.001;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex !== -1 && bestIndex !== visiblePageRef.current) {
      visiblePageRef.current = bestIndex;
      onPageChange(bestIndex);
    }
  }, [numPages, onPageChange]);

  const schedulePageCheck = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateCurrentPage();
    });
  }, [updateCurrentPage]);

  // 스크롤 위치 → 현재 페이지. 화면 기준선에 걸린 페이지를 직접 계산한다.
  useEffect(() => {
    if (!numPages || !containerRef.current) return;
    const root = containerRef.current;
    root.addEventListener("scroll", schedulePageCheck, { passive: true });
    window.addEventListener("resize", schedulePageCheck);
    schedulePageCheck();
    return () => {
      root.removeEventListener("scroll", schedulePageCheck);
      window.removeEventListener("resize", schedulePageCheck);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [numPages, schedulePageCheck]);

  // 플로팅 위젯 prev/next → 해당 페이지로 스크롤
  useEffect(() => {
    if (scrollRequest === null) return;
    pageRefs.current[scrollRequest.page]?.scrollIntoView({ behavior: "smooth", block: "start" });
    visiblePageRef.current = scrollRequest.page;
    onPageChange(scrollRequest.page);
  }, [onPageChange, scrollRequest]);

  const setPageRef = useCallback((el: HTMLDivElement | null, index: number) => {
    pageRefs.current[index] = el;
  }, []);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto space-y-3 px-4 py-4">
      <Document
        file={file}
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          visiblePageRef.current = -1;
          schedulePageCheck();
        }}
        loading={
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <span className="animate-pulse">PDF 렌더링 중...</span>
          </div>
        }
        error={
          <div className="py-12 text-center text-sm text-red-400">
            PDF를 불러올 수 없습니다. 파일을 다시 업로드해 주세요.
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div
            key={i}
            ref={(el) => setPageRef(el, i)}
            className="group relative overflow-hidden rounded-lg border border-slate-200 shadow-sm"
          >
            {/* 페이지 오버레이 버튼 (호버 시 표시) */}
            <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-2xs font-semibold text-white backdrop-blur-sm">
                {i + 1}p
              </span>
              <button
                onClick={() => onAnalyzePage(i)}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2 py-0.5 text-2xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-indigo-700 disabled:opacity-40"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                AI 분석
              </button>
            </div>
            <Page
              pageNumber={i + 1}
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onRenderSuccess={schedulePageCheck}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
