"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  analyzeCoverLetterJobs,
  getCoverLetter,
  listCoverLetters,
  type CoverLetter,
  type CoverLetterJobAnalysis,
} from "@/lib/api/recruit/cover-letter";
import { isNearScrollBottom } from "@/lib/scroll-guards";
import { MODELS } from "../../_constants";

const PAGE_SIZE = 30;

export type AiJobFilter = "all" | "IT" | "전자";

export function useCoverLetterList(coverId: string | null) {
  const router = useRouter();

  const [items, setItems] = useState<CoverLetter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [companyTypeFilter, setCompanyTypeFilter] = useState("");
  const [aiJobFilter, setAiJobFilter] = useState<AiJobFilter>("all");

  const [jobAnalyses, setJobAnalyses] = useState<Record<string, CoverLetterJobAnalysis>>({});
  const [jobAnalysisLoading, setJobAnalysisLoading] = useState(false);
  const [jobAnalysisError, setJobAnalysisError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CoverLetter | null>(null);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);

  const loaderRef = useRef<HTMLDivElement>(null);
  const listScrollTopRef = useRef(0);
  const detailScrollTopRef = useRef(0);

  const rawFiltered = items.filter((cl) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      cl.company.toLowerCase().includes(q) ||
      cl.position.toLowerCase().includes(q) ||
      cl.season.toLowerCase().includes(q) ||
      cl.questions.some((item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q))
    );
  });

  const filtered = rawFiltered.filter((cl) => {
    if (aiJobFilter === "all") return true;
    return jobAnalyses[cl.id]?.jobCategory === aiJobFilter;
  });

  const load = useCallback(
    async (p: number, reset = false) => {
      setLoading(true);
      try {
        const res = await listCoverLetters(p, PAGE_SIZE, {
          source: sourceFilter || undefined,
          companyType: companyTypeFilter || undefined,
          search: search.trim() || undefined,
        });
        setTotal(res.total);
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setHasMore(res.items.length === PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    },
    [companyTypeFilter, search, sourceFilter],
  );

  useEffect(() => {
    setPage(1);
    load(1, true);
  }, [load]);

  // Sync URL cover param
  useEffect(() => {
    if (!coverId) {
      setSelected(null);
      return;
    }
    const existing = items.find((item) => item.id === coverId);
    if (existing) {
      setSelected(existing);
      return;
    }
    let cancelled = false;
    getCoverLetter(coverId)
      .then((item) => {
        if (cancelled) return;
        setSelected(item);
        setItems((prev) => (prev.some((x) => x.id === item.id) ? prev : [item, ...prev]));
      })
      .catch(() => {
        if (!cancelled) setSelected(null);
      });
    return () => {
      cancelled = true;
    };
  }, [coverId, items]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          const next = page + 1;
          setPage(next);
          load(next);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, page, load]);

  // Keyboard nav
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selected || isTypingTarget(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const currentIndex = filtered.findIndex((item) => item.id === selected.id);
      if (currentIndex < 0) return;
      const nextIndex = event.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1;
      const next = filtered[nextIndex];
      if (!next) return;
      event.preventDefault();
      setSelected(next);
      router.push(`/recruit/cover-letter?cover=${encodeURIComponent(next.id)}`);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, router, selected]);

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    if (isNearScrollBottom(el)) {
      listScrollTopRef.current = scrollTop;
      return;
    }
    const delta = scrollTop - listScrollTopRef.current;
    listScrollTopRef.current = scrollTop;
    if (Math.abs(delta) < 4) return;
    if (delta > 0 && scrollTop > 10) setIsHeaderHidden(true);
    else if (delta < 0) setIsHeaderHidden(false);
  }, []);

  const handleDetailScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    if (isNearScrollBottom(el)) {
      detailScrollTopRef.current = scrollTop;
      return;
    }
    const delta = scrollTop - detailScrollTopRef.current;
    detailScrollTopRef.current = scrollTop;
    if (Math.abs(delta) < 4) return;
    if (delta > 0 && scrollTop > 10) setIsHeaderHidden(true);
    else if (delta < 0) setIsHeaderHidden(false);
  }, []);

  const handleSelect = (cl: CoverLetter) => {
    setSelected(cl);
    router.push(`/recruit/cover-letter?cover=${encodeURIComponent(cl.id)}`);
  };

  const handleBack = () => {
    if (selected) {
      setSelected(null);
      router.push("/recruit/cover-letter");
      return;
    }
    router.back();
  };

  const handleAnalyzeJobs = async () => {
    const targets = rawFiltered.slice(0, 50);
    if (targets.length === 0 || jobAnalysisLoading) return;
    setJobAnalysisLoading(true);
    setJobAnalysisError(null);
    try {
      const res = await analyzeCoverLetterJobs({
        ids: targets.map((item) => item.id),
        target: "all",
        model: MODELS[0].id,
        limit: 50,
      });
      setJobAnalyses((prev) => {
        const next = { ...prev };
        for (const item of res.items) next[item.id] = item;
        return next;
      });
    } catch (e) {
      setJobAnalysisError(e instanceof Error ? e.message : "AI 직무 분류에 실패했습니다.");
    } finally {
      setJobAnalysisLoading(false);
    }
  };

  const reload = useCallback(() => {
    setPage(1);
    load(1, true);
  }, [load]);

  return {
    items,
    total,
    loading,
    hasMore,
    search,
    setSearch,
    sourceFilter,
    setSourceFilter,
    companyTypeFilter,
    setCompanyTypeFilter,
    aiJobFilter,
    setAiJobFilter,
    jobAnalyses,
    jobAnalysisLoading,
    jobAnalysisError,
    selected,
    isHeaderHidden,
    rawFiltered,
    filtered,
    loaderRef,
    handleListScroll,
    handleDetailScroll,
    handleSelect,
    handleBack,
    handleAnalyzeJobs,
    reload,
  };
}
