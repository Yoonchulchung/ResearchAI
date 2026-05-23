"use client";

import { useState, useEffect, useRef } from "react";
import { startScraping, stopScraping, getScrapingStatus, type ScrapeStatus } from "@/lib/api/recruit/cover-letter";

export function useCoverLetterScraping(onScrapeDone: () => void) {
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeSource, setScrapeSource] = useState<"all" | "linkareer" | "catch">("all");

  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onScrapeDoneRef = useRef(onScrapeDone);
  onScrapeDoneRef.current = onScrapeDone;

  useEffect(() => {
    getScrapingStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (status?.running) {
      statusTimerRef.current = setInterval(async () => {
        try {
          const s = await getScrapingStatus();
          setStatus(s);
          if (!s.running) {
            clearInterval(statusTimerRef.current!);
            onScrapeDoneRef.current();
          }
        } catch {}
      }, 2000);
    }
    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, [status?.running]);

  const handleStart = async () => {
    setScrapeLoading(true);
    try {
      await startScraping({ source: scrapeSource });
      const s = await getScrapingStatus();
      setStatus(s);
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleStop = async () => {
    setScrapeLoading(true);
    try {
      await stopScraping();
      const s = await getScrapingStatus();
      setStatus(s);
      onScrapeDoneRef.current();
    } finally {
      setScrapeLoading(false);
    }
  };

  return { status, scrapeLoading, scrapeSource, setScrapeSource, handleStart, handleStop };
}
