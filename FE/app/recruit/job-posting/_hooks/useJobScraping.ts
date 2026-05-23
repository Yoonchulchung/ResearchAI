"use client";

import { useState, useEffect, useRef } from "react";
import {
  startJobScraping,
  stopJobScraping,
  getJobScrapingStatus,
  type JobScrapingStatus,
} from "@/lib/api/recruit/job-posting";

export function useJobScraping(onScrapeDone: () => void) {
  const [status, setStatus] = useState<JobScrapingStatus | null>(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeSource, setScrapeSource] = useState<"linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all">("all");
  const [linkareerJobType, setLinkareerJobType] = useState<"INTERN" | "RECRUIT">("INTERN");

  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onScrapeDoneRef = useRef(onScrapeDone);
  onScrapeDoneRef.current = onScrapeDone;

  useEffect(() => {
    getJobScrapingStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (status?.running) {
      statusTimerRef.current = setInterval(async () => {
        try {
          const s = await getJobScrapingStatus();
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
      await startJobScraping(
        scrapeSource === "all"
          ? { source: "all" }
          : scrapeSource === "jobkorea"
            ? { source: "jobkorea" }
            : scrapeSource === "catch"
              ? { source: "catch" }
              : scrapeSource === "jobplanet"
                ? { source: "jobplanet" }
                : scrapeSource === "jobda"
                  ? { source: "jobda" }
                  : { source: "linkareer", jobType: linkareerJobType },
      );
      const s = await getJobScrapingStatus();
      setStatus(s);
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleStop = async () => {
    setScrapeLoading(true);
    try {
      await stopJobScraping();
      const s = await getJobScrapingStatus();
      setStatus(s);
      onScrapeDoneRef.current();
    } finally {
      setScrapeLoading(false);
    }
  };

  return {
    status,
    scrapeLoading,
    scrapeSource,
    setScrapeSource,
    linkareerJobType,
    setLinkareerJobType,
    handleStart,
    handleStop,
  };
}
