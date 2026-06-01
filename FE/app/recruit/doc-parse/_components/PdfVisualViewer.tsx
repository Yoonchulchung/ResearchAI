"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface PdfViewerPosition {
  page: number;
  scrollTop: number;
  scrollLeft: number;
  scale: number;
}

interface Props {
  file: string | globalThis.File | Blob;
  onPageChange: (page: number) => void;
  onAnalyzePage: (page: number) => void;
  scrollRequest: { page: number; id: number } | null;
  initialPosition?: PdfViewerPosition | null;
  onPositionChange?: (position: PdfViewerPosition) => void;
  disabled?: boolean;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_SETTLE_MS = 900;
const ZOOM_ANIMATION_MS = 180;
const ZOOM_RENDER_STEP = 0.18;
const ZOOM_RENDER_THROTTLE_MS = 140;
const PAGE_GAP = 12;
const PAGE_RENDER_RADIUS = 2;
const DEFAULT_PAGE_RATIO = 1.414;
// Must match the Tailwind px-4 py-4 on the scroll container
const CONTAINER_PADDING = 16;

const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

interface ZoomAnchor {
  docX: number;
  docY: number;
  focusX: number;
  focusY: number;
}

export default function PdfVisualViewer({ file, onPageChange, onAnalyzePage, scrollRequest, initialPosition, onPositionChange, disabled }: Props) {
  const initialScale = initialPosition?.scale ?? 1.0;
  const [numPages, setNumPages] = useState(0);
  const [baseWidth, setBaseWidth] = useState(600);
  const [visualScale, setVisualScale] = useState(initialScale);
  const [renderScale, setRenderScale] = useState(initialScale);
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());
  const [displayPage, setDisplayPage] = useState(initialPosition?.page ?? 0);
  const [pageRatios, setPageRatios] = useState<number[]>([]);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 0]);

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);     // scroll container (foreground viewport)
  const outerWrapperRef = useRef<HTMLDivElement>(null);  // background: full content at current zoom
  const innerWrapperRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const visiblePageRef = useRef(initialPosition?.page ?? -1);
  const visibleRangeRef = useRef<[number, number]>([0, 0]);
  const pageSnapshotsRef = useRef<Map<number, string>>(new Map());
  const didRestorePositionRef = useRef(false);
  const initialPositionRef = useRef<PdfViewerPosition | null>(initialPosition ?? null);
  const onPositionChangeRef = useRef(onPositionChange);
  useEffect(() => { onPositionChangeRef.current = onPositionChange; }, [onPositionChange]);

  // ── Value refs (avoid stale closures in event handlers) ───────────────────
  const visualScaleRef = useRef(initialScale);
  const renderScaleRef = useRef(initialScale);
  const baseWidthRef = useRef(600);
  visualScaleRef.current = visualScale;
  renderScaleRef.current = renderScale;
  baseWidthRef.current = baseWidth;

  // ── Intended scroll refs ──────────────────────────────────────────────────
  // el.scrollLeft/Top can be clamped by the browser when outerWrapper hasn't updated its
  // width yet (React re-render is async). These refs always hold the mathematically correct
  // value so rapid zoom events compute the right focus point even before React re-renders.
  const intendedScrollLeft = useRef(0);
  const intendedScrollTop = useRef(0);

  // ── Zoom-settle refs ──────────────────────────────────────────────────────
  const zoomActiveRef = useRef(false);
  const zoomEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateCurrentPageRef = useRef<(() => void) | null>(null);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const zoomSessionRef = useRef(0);
  const zoomAnimationFrameRef = useRef<number | null>(null);
  const zoomAnimationStartRef = useRef(0);
  const zoomAnimationFromRef = useRef(initialScale);
  const zoomAnimationToRef = useRef(initialScale);
  const lastRenderScaleUpdateRef = useRef(0);
  const pendingAnchorReleaseRef = useRef(false);
  const anchorReleaseScheduledRef = useRef(false);
  const pendingReleaseSessionRef = useRef(0);
  const pendingPageRatiosRef = useRef<Map<number, number>>(new Map());

  const renderWidth = Math.floor(baseWidth * renderScale);
  const cssScale = visualScale / renderScale;
  const getPageHeight = useCallback((index: number) => Math.floor(renderWidth * (pageRatios[index] ?? DEFAULT_PAGE_RATIO)), [pageRatios, renderWidth]);
  const totalUnscaledHeight = Array.from({ length: numPages }, (_, i) => getPageHeight(i))
    .reduce((sum, height) => sum + height, 0) + Math.max(0, numPages - 1) * PAGE_GAP;
  const outerHeight = totalUnscaledHeight * cssScale;

  const updateVisibleRange = useCallback((centerIndex: number) => {
    if (!numPages) return;
    const start = Math.max(0, centerIndex - PAGE_RENDER_RADIUS);
    const end = Math.min(numPages - 1, centerIndex + PAGE_RENDER_RADIUS);
    const prev = visibleRangeRef.current;
    if (prev[0] === start && prev[1] === end) return;
    visibleRangeRef.current = [start, end];
    setVisibleRange([start, end]);
  }, [numPages]);

  const isPageInRenderRange = useCallback((index: number) => {
    const [start, end] = visibleRange;
    return index >= start && index <= end;
  }, [visibleRange]);

  const emitPosition = useCallback((page = visiblePageRef.current) => {
    const el = containerRef.current;
    if (!el || page < 0) return;
    onPositionChangeRef.current?.({
      page,
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
      scale: visualScaleRef.current,
    });
  }, []);

  const getHorizontalOffset = useCallback((contentWidth: number) => {
    const el = containerRef.current;
    if (!el) return CONTAINER_PADDING;
    const viewportWidth = el.clientWidth - CONTAINER_PADDING * 2;
    return CONTAINER_PADDING + Math.max(0, (viewportWidth - contentWidth) / 2);
  }, []);

  const getVisualContentWidth = useCallback((scale: number) => {
    const rw = Math.floor(baseWidthRef.current * renderScaleRef.current);
    return rw * (scale / renderScaleRef.current);
  }, []);

  const createZoomAnchor = useCallback((focusX: number, focusY: number): ZoomAnchor | null => {
    const el = containerRef.current;
    if (!el) return null;
    const currentContentWidth = getVisualContentWidth(visualScaleRef.current);
    const offsetX = getHorizontalOffset(currentContentWidth);
    const offsetY = CONTAINER_PADDING;
    return {
      docX: (intendedScrollLeft.current + focusX - offsetX) / visualScaleRef.current,
      docY: (intendedScrollTop.current + focusY - offsetY) / visualScaleRef.current,
      focusX,
      focusY,
    };
  }, [getHorizontalOffset, getVisualContentWidth]);

  const applyAnchorScroll = useCallback((anchor: ZoomAnchor, scale: number) => {
    const el = containerRef.current;
    if (!el) return;
    const contentWidth = getVisualContentWidth(scale);
    const offsetX = getHorizontalOffset(contentWidth);
    const offsetY = CONTAINER_PADDING;
    const nextLeft = anchor.docX * scale + offsetX - anchor.focusX;
    const nextTop = anchor.docY * scale + offsetY - anchor.focusY;
    intendedScrollLeft.current = nextLeft;
    intendedScrollTop.current = nextTop;
    el.scrollLeft = nextLeft;
    el.scrollTop = nextTop;
  }, [getHorizontalOffset, getVisualContentWidth]);

  const getViewportZoomFocus = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    return {
      x: el.clientWidth / 2,
      y: el.clientHeight / 2,
    };
  }, []);

  const getPointerZoomFocus = useCallback((event: WheelEvent) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(el.clientWidth, Math.max(0, event.clientX - rect.left)),
      y: Math.min(el.clientHeight, Math.max(0, event.clientY - rect.top)),
    };
  }, []);

  const markVisiblePagesForRender = useCallback(() => {
    const [start, end] = visibleRangeRef.current;
    const count = end - start + 1;
    if (count <= 0) return;
    setRenderingPages(new Set(Array.from({ length: count }, (_, i) => start + i)));
  }, []);

  const flushPendingPageRatios = useCallback(() => {
    if (pendingPageRatiosRef.current.size === 0) return;
    const pending = pendingPageRatiosRef.current;
    pendingPageRatiosRef.current = new Map();
    setPageRatios((prev) => {
      let changed = false;
      const next = [...prev];
      pending.forEach((ratio, index) => {
        if (Math.abs((next[index] ?? 0) - ratio) >= 0.0001) {
          next[index] = ratio;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const updateRenderScaleDuringZoom = useCallback((scale: number, force = false) => {
    const nextRenderScale = clampZoom(scale);
    const now = performance.now();
    const enoughScaleDelta = Math.abs(nextRenderScale - renderScaleRef.current) >= ZOOM_RENDER_STEP;
    const enoughTimeDelta = now - lastRenderScaleUpdateRef.current >= ZOOM_RENDER_THROTTLE_MS;
    if (!force && (!enoughScaleDelta || !enoughTimeDelta)) return;
    if (Math.abs(nextRenderScale - renderScaleRef.current) < 0.01) return;

    lastRenderScaleUpdateRef.current = now;
    markVisiblePagesForRender();
    setRenderScale(nextRenderScale);
  }, [markVisiblePagesForRender]);
  const updateRenderScaleDuringZoomRef = useRef(updateRenderScaleDuringZoom);
  updateRenderScaleDuringZoomRef.current = updateRenderScaleDuringZoom;

  const animateZoomTo = useCallback((targetScale: number, anchor: ZoomAnchor) => {
    if (zoomAnimationFrameRef.current !== null) {
      cancelAnimationFrame(zoomAnimationFrameRef.current);
      zoomAnimationFrameRef.current = null;
    }

    zoomAnimationFromRef.current = visualScaleRef.current;
    zoomAnimationToRef.current = targetScale;
    zoomAnimationStartRef.current = performance.now();

    const step = (now: number) => {
      const elapsed = now - zoomAnimationStartRef.current;
      const progress = Math.min(1, Math.max(0, elapsed / ZOOM_ANIMATION_MS));
      const eased = easeOutCubic(progress);
      const from = zoomAnimationFromRef.current;
      const to = zoomAnimationToRef.current;
      const nextScale = progress >= 1 ? to : from + (to - from) * eased;

      applyAnchorScroll(anchor, nextScale);
      visualScaleRef.current = nextScale;
      setVisualScale(nextScale);
      updateRenderScaleDuringZoomRef.current(nextScale);

      if (progress < 1 && Math.abs(to - nextScale) > 0.0005) {
        zoomAnimationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      applyAnchorScroll(anchor, to);
      visualScaleRef.current = to;
      setVisualScale(to);
      zoomAnimationFrameRef.current = null;
      updateRenderScaleDuringZoomRef.current(to);
      emitPosition();
    };

    zoomAnimationFrameRef.current = requestAnimationFrame(step);
  }, [applyAnchorScroll, emitPosition]);
  const animateZoomToRef = useRef(animateZoomTo);
  animateZoomToRef.current = animateZoomTo;

  const getZoomTargetBase = useCallback(() => (
    zoomAnimationFrameRef.current !== null ? zoomAnimationToRef.current : visualScaleRef.current
  ), []);

  // ── Core zoom function ────────────────────────────────────────────────────
  //
  // Two-layer model:
  //   background = outerWrapperRef  (full content at current zoom: width × height)
  //   foreground = containerRef     (viewport the user sees: clientWidth × clientHeight)
  //
  // Invariant: the content pixel (contentX, contentY) that sits under (focusX, focusY)
  //            in the viewport must remain under (focusX, focusY) after zoom.
  //
  // For Ctrl+scroll:  focusX/Y = pointer position inside the viewport
  // For toolbar +/−:  focusX/Y = viewport center (clientWidth/2, clientHeight/2)
  //
  // Offsets are computed mathematically (no getBoundingClientRect) so this function
  // remains correct during rapid zoom — each call uses updated refs from the previous
  // call even before React has re-rendered.
  //
  const applyZoomRef = useRef((newVisual: number, focusX: number, focusY: number, immediate = false) => {
    const el = containerRef.current;
    if (!el) return;
    if (newVisual === visualScaleRef.current) return;

    const anchor = zoomAnchorRef.current ?? createZoomAnchor(focusX, focusY);
    if (!anchor) return;
    const session = ++zoomSessionRef.current;
    zoomAnchorRef.current = anchor;
    pendingAnchorReleaseRef.current = false;
    anchorReleaseScheduledRef.current = false;
    pendingReleaseSessionRef.current = 0;

    zoomActiveRef.current = true;
    if (zoomEndTimerRef.current !== null) clearTimeout(zoomEndTimerRef.current);
    zoomEndTimerRef.current = setTimeout(() => {
      if (zoomSessionRef.current !== session) return;
      zoomActiveRef.current = false;
      zoomEndTimerRef.current = null;
      updateCurrentPageRef.current?.();
      pendingAnchorReleaseRef.current = true;
      pendingReleaseSessionRef.current = session;
      updateRenderScaleDuringZoomRef.current(visualScaleRef.current);
    }, ZOOM_SETTLE_MS);

    if (immediate) {
      if (zoomAnimationFrameRef.current !== null) {
        cancelAnimationFrame(zoomAnimationFrameRef.current);
        zoomAnimationFrameRef.current = null;
      }
      
      // For buttery smooth trackpad zoom, we apply CSS scale directly to the DOM to sync with scroll.
      // This prevents the 1-frame jitter that occurs if we wait for React state to apply the scale visually.
      const currentRenderScale = renderScaleRef.current;
      const directCssScale = newVisual / currentRenderScale;
      const rWidth = Math.floor(baseWidthRef.current * currentRenderScale);
      
      if (innerWrapperRef.current) {
        innerWrapperRef.current.style.transform = `scale(${directCssScale})`;
      }
      if (outerWrapperRef.current) {
        outerWrapperRef.current.style.width = `${rWidth * directCssScale}px`;
      }
      
      applyAnchorScroll(anchor, newVisual);
      
      visualScaleRef.current = newVisual;
      setVisualScale(newVisual); // Let React state catch up
      updateRenderScaleDuringZoomRef.current(newVisual);
    } else {
      animateZoomToRef.current(newVisual, anchor);
    }
    emitPosition();
  });

  // After React updates outerWrapper width, re-apply intended scroll.
  // Without this, el.scrollLeft stays clamped at the old width until the user scrolls.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const anchor = zoomAnchorRef.current;
    if (anchor) applyAnchorScroll(anchor, visualScaleRef.current);
    else {
      el.scrollLeft = intendedScrollLeft.current;
      el.scrollTop  = intendedScrollTop.current;
    }

    if (
      anchor &&
      pendingAnchorReleaseRef.current &&
      !anchorReleaseScheduledRef.current &&
      !zoomActiveRef.current &&
      pendingReleaseSessionRef.current === zoomSessionRef.current
    ) {
      const releaseSession = pendingReleaseSessionRef.current;
      anchorReleaseScheduledRef.current = true;
      requestAnimationFrame(() => {
        if (
          zoomActiveRef.current ||
          releaseSession !== zoomSessionRef.current ||
          !pendingAnchorReleaseRef.current
        ) {
          anchorReleaseScheduledRef.current = false;
          return;
        }
        applyAnchorScroll(anchor, visualScaleRef.current);
        zoomAnchorRef.current = null;
        pendingAnchorReleaseRef.current = false;
        anchorReleaseScheduledRef.current = false;
        pendingReleaseSessionRef.current = 0;
        flushPendingPageRatios();
        updateCurrentPageRef.current?.();
      });
    }
  }, [applyAnchorScroll, flushPendingPageRatios, visualScale, renderScale, baseWidth, pageRatios]);

  // ── Helpers to trigger zoom from toolbar buttons ──────────────────────────
  const zoomBy = useCallback((delta: number) => {
    const el = containerRef.current;
    const focus = getViewportZoomFocus();
    if (!el || !focus) return;
    zoomAnchorRef.current = createZoomAnchor(focus.x, focus.y);
    const newVisual = clampZoom(getZoomTargetBase() + delta);
    applyZoomRef.current(newVisual, focus.x, focus.y);
  }, [createZoomAnchor, getViewportZoomFocus, getZoomTargetBase]);

  const zoomReset = useCallback(() => {
    const el = containerRef.current;
    const focus = getViewportZoomFocus();
    if (!el || !focus) return;
    zoomAnchorRef.current = createZoomAnchor(focus.x, focus.y);
    applyZoomRef.current(1.0, focus.x, focus.y);
  }, [createZoomAnchor, getViewportZoomFocus]);

  // ── Responsive base width ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) =>
      setBaseWidth(Math.floor(entry.contentRect.width - CONTAINER_PADDING * 2)),
    );
    ro.observe(containerRef.current);
    setBaseWidth(Math.floor(containerRef.current.clientWidth - CONTAINER_PADDING * 2));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPageRatios([]);
    visibleRangeRef.current = [0, Math.min(PAGE_RENDER_RADIUS, Math.max(0, numPages - 1))];
    setVisibleRange([0, Math.min(PAGE_RENDER_RADIUS, Math.max(0, numPages - 1))]);
  }, [numPages]);

  // ── Ctrl+Scroll: pointer-centered zoom ───────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const focus = getPointerZoomFocus(e);
      if (!focus) return;

      let deltaY = e.deltaY;
      if (e.deltaMode === 1) deltaY *= 33; // DOM_DELTA_LINE

      // Cap deltaY to prevent massive jumps from generic mouse wheels
      const cappedDelta = Math.sign(deltaY) * Math.min(Math.abs(deltaY), 60);

      // Natural exponential zoom curve
      const zoomFactor = Math.exp(-cappedDelta * 0.008);
      const newVisual = clampZoom(visualScaleRef.current * zoomFactor);

      zoomAnchorRef.current = createZoomAnchor(focus.x, focus.y);
      applyZoomRef.current(newVisual, focus.x, focus.y, true); // immediate, no animation lag
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [createZoomAnchor, getPointerZoomFocus, getZoomTargetBase]);

  // ── Page tracking ─────────────────────────────────────────────────────────
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

      if (score < bestScore) { bestScore = score; bestIndex = index; }
    });

    if (bestIndex !== -1) {
      visiblePageRef.current = bestIndex;
      if (!zoomActiveRef.current) {
        updateVisibleRange(bestIndex);
        setDisplayPage(bestIndex);
        onPageChange(bestIndex);
      }
      emitPosition(bestIndex);
    }
  }, [emitPosition, numPages, onPageChange, updateVisibleRange]);

  useEffect(() => { updateCurrentPageRef.current = updateCurrentPage; }, [updateCurrentPage]);

  const schedulePageCheck = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateCurrentPage();
    });
  }, [updateCurrentPage]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const position = initialPositionRef.current;
    if (!el || !numPages || didRestorePositionRef.current || !position) return;

    const page = Math.min(Math.max(position.page, 0), numPages - 1);
    updateVisibleRange(page);
    visiblePageRef.current = page;
    setDisplayPage(page);
    onPageChange(page);

    requestAnimationFrame(() => {
      intendedScrollLeft.current = position.scrollLeft;
      intendedScrollTop.current = position.scrollTop;
      el.scrollLeft = position.scrollLeft;
      el.scrollTop = position.scrollTop;
      didRestorePositionRef.current = true;
      emitPosition(page);
      schedulePageCheck();
    });
  }, [emitPosition, numPages, onPageChange, schedulePageCheck, updateVisibleRange]);

  useEffect(() => {
    if (!numPages || !containerRef.current) return;
    const root = containerRef.current;

    const handleScroll = () => {
      // Sync intended refs from DOM only when not zooming.
      // During zoom, applyZoomRef already set them to the correct values;
      // reading clamped DOM values here would corrupt the next zoom computation.
      if (!zoomActiveRef.current) {
        intendedScrollLeft.current = root.scrollLeft;
        intendedScrollTop.current  = root.scrollTop;
      }
      emitPosition(visiblePageRef.current);
      schedulePageCheck();
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", schedulePageCheck);
    schedulePageCheck();
    return () => {
      root.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", schedulePageCheck);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [emitPosition, numPages, schedulePageCheck]);

  useEffect(() => {
    if (scrollRequest === null) return;
    updateVisibleRange(scrollRequest.page);
    pageRefs.current[scrollRequest.page]?.scrollIntoView({ behavior: "smooth", block: "start" });
    visiblePageRef.current = scrollRequest.page;
    setDisplayPage(scrollRequest.page);
    onPageChange(scrollRequest.page);
    emitPosition(scrollRequest.page);
  }, [emitPosition, onPageChange, scrollRequest, updateVisibleRange]);

  useEffect(() => () => {
    if (zoomAnimationFrameRef.current !== null) {
      cancelAnimationFrame(zoomAnimationFrameRef.current);
      zoomAnimationFrameRef.current = null;
    }
    if (zoomEndTimerRef.current !== null) {
      clearTimeout(zoomEndTimerRef.current);
      zoomEndTimerRef.current = null;
    }
  }, []);

  const setPageRef = useCallback((el: HTMLDivElement | null, index: number) => {
    pageRefs.current[index] = el;
  }, []);

  // After each page renders: snapshot canvas for next re-render cycle, then reveal sharp render
  const handlePageRenderSuccess = useCallback((index: number) => {
    const wrapper = pageRefs.current[index];
    if (wrapper) {
      const canvas = wrapper.querySelector("canvas");
      if (canvas) {
        try { pageSnapshotsRef.current.set(index, canvas.toDataURL()); } catch { /* ignore */ }
      }
    }
    setRenderingPages((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    schedulePageCheck();
  }, [schedulePageCheck]);

  const handlePageLoadSuccess = useCallback((index: number, page: { originalWidth?: number; originalHeight?: number; width?: number; height?: number }) => {
    const originalWidth = page.originalWidth ?? page.width;
    const originalHeight = page.originalHeight ?? page.height;
    if (!originalWidth || !originalHeight) return;
    const ratio = originalHeight / originalWidth;
    if (zoomActiveRef.current || zoomAnchorRef.current) {
      pendingPageRatiosRef.current.set(index, ratio);
      return;
    }
    setPageRatios((prev) => {
      if (Math.abs((prev[index] ?? 0) - ratio) < 0.0001) return prev;
      const next = [...prev];
      next[index] = ratio;
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: page number + zoom controls */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-slate-200 px-3 py-1.5 dark:border-white/10">
        <span className="text-xs font-medium text-slate-500 dark:text-white/40">
          {numPages > 0 ? `${displayPage + 1} / ${numPages}` : "—"}
        </span>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-slate-400 dark:text-white/40">{Math.round(visualScale * 100)}%</span>
          <button
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={visualScale <= ZOOM_MIN}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/10"
            title="축소 (Ctrl+스크롤)"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <button
            onClick={zoomReset}
            className="h-6 rounded border border-slate-200 px-1.5 text-2xs text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/10"
            title="원래 크기로"
          >
            초기화
          </button>
          <button
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={visualScale >= ZOOM_MAX}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/10"
            title="확대 (Ctrl+스크롤)"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* PDF scroll area */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto px-4 py-4"
        style={{ contain: "strict" }}
      >
        {/* Center content horizontally; min-w-fit lets it expand when content overflows */}
        <div className="flex min-w-fit justify-center">
          <Document
            file={file}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              const restoredPage = initialPositionRef.current
                ? Math.min(Math.max(initialPositionRef.current.page, 0), n - 1)
                : 0;
              visiblePageRef.current = restoredPage;
              setDisplayPage(restoredPage);
              updateVisibleRange(restoredPage);
              pageSnapshotsRef.current.clear();
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
            {/*
              outerWrapper (background): layout width = renderWidth × cssScale
                → scroll range reflects the true visual content size
              innerWrapper: CSS scale(cssScale) with transformOrigin top-left
                → immediate visual zoom without re-rendering the PDF
            */}
            <div
              ref={outerWrapperRef}
              style={{
                width: `${renderWidth * cssScale}px`,
                height: `${outerHeight}px`,
              }}
            >
              <div
                ref={innerWrapperRef}
                style={{
                  transform: `scale(${cssScale})`,
                  transformOrigin: "top left",
                  display: "flex",
                  flexDirection: "column",
                  gap: `${PAGE_GAP}px`,
                  width: `${renderWidth}px`,
                }}
              >
                {Array.from({ length: numPages }, (_, i) => {
                  const pageHeight = getPageHeight(i);
                  const shouldRender = isPageInRenderRange(i);
                  return (
                    <div
                      key={i}
                      ref={(el) => setPageRef(el, i)}
                      className={`group relative overflow-hidden rounded-lg border border-slate-200 shadow-sm ${shouldRender ? "bg-white" : "bg-slate-50"}`}
                      style={{ width: `${renderWidth}px`, height: `${pageHeight}px` }}
                    >
                      {shouldRender ? (
                        <>
                          {/* Snapshot overlay: hides the blank canvas while react-pdf re-renders */}
                          {renderingPages.has(i) && pageSnapshotsRef.current.has(i) && (
                            <img
                              alt=""
                              aria-hidden
                              src={pageSnapshotsRef.current.get(i)!}
                              className="pointer-events-none absolute inset-0 h-full w-full"
                              style={{ zIndex: 1, objectFit: "fill" }}
                            />
                          )}
                          <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
                            width={renderWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={(page) => handlePageLoadSuccess(i, page)}
                            onRenderSuccess={() => handlePageRenderSuccess(i)}
                          />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs font-medium text-slate-300">
                          {i + 1}p
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
}
