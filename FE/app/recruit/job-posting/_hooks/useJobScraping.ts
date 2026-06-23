"use client";

import { useState, useEffect, useRef } from "react";
import {
  startJobScraping,
  stopJobScraping,
  getJobScrapingStatus,
  startCollectDetail,
  stopCollectDetail,
  getCollectDetailStatus,
  type JobScrapingStatus,
  type CollectDetailStatus,
  type CollectDetailConfig,
  type JobkoreaCompanyType,
} from "@/lib/api/recruit/job-posting";

export function useJobScraping(onScrapeDone: () => void) {
  const [status, setStatus] = useState<JobScrapingStatus | null>(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeSource, setScrapeSource] = useState<"linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all">("all");
  const [linkareerJobType, setLinkareerJobType] = useState<"INTERN" | "RECRUIT">("INTERN");
  const [jobkoreaCompanyTypes, setJobkoreaCompanyTypes] = useState<JobkoreaCompanyType[]>([]);

  const [collectStatus, setCollectStatus] = useState<CollectDetailStatus | null>(null);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectConfig, setCollectConfig] = useState<CollectDetailConfig>({
    model: "claude-sonnet-4-6",
    enableVlm: true,
    skipAiSteps: false,
    maxItems: 0,
    skipExisting: true,
    companyTypes: [],
    jobTypes: ["신입", "인턴"],
    jobs: ["IT", "기획", "전자"],
  });
  const collectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onScrapeDoneRef = useRef(onScrapeDone);
  onScrapeDoneRef.current = onScrapeDone;

  useEffect(() => {
    getJobScrapingStatus().then(setStatus).catch(() => {});
    getCollectDetailStatus().then(setCollectStatus).catch(() => {});
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
            ? { source: "jobkorea", jobkoreaCompanyTypes }
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

  // ── 채용 상세 수집 ──────────────────────────────────────────
  useEffect(() => {
    if (collectStatus?.running) {
      collectTimerRef.current = setInterval(async () => {
        try {
          const s = await getCollectDetailStatus();
          setCollectStatus(s);
          if (!s.running) clearInterval(collectTimerRef.current!);
        } catch {}
      }, 2000);
    }
    return () => {
      if (collectTimerRef.current) clearInterval(collectTimerRef.current);
    };
  }, [collectStatus?.running]);

  const handleCollectStart = async () => {
    setCollectLoading(true);
    try {
      await startCollectDetail(collectConfig);
      const s = await getCollectDetailStatus();
      setCollectStatus(s);
    } finally {
      setCollectLoading(false);
    }
  };

  const handleCollectStop = async () => {
    setCollectLoading(true);
    try {
      await stopCollectDetail();
      const s = await getCollectDetailStatus();
      setCollectStatus(s);
    } finally {
      setCollectLoading(false);
    }
  };

  return {
    status,
    scrapeLoading,
    scrapeSource,
    setScrapeSource,
    linkareerJobType,
    setLinkareerJobType,
    jobkoreaCompanyTypes,
    setJobkoreaCompanyTypes,
    handleStart,
    handleStop,
    collectStatus,
    collectLoading,
    collectConfig,
    setCollectConfig,
    handleCollectStart,
    handleCollectStop,
  };
}
