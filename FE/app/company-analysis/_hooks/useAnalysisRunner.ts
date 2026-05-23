"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeCompanyStream,
  streamCompanyAnalysisJob,
  type CompanyAnalysis,
  type AnalyzeProgressEvent,
} from "@/lib/api/company-analysis";
import { getQueueStatus } from "@/lib/api/queue";
import { normalizeCompanyKey, estimateAnalysisProgress, getAnalysisStepLabel } from "../_utils";

export type AnalysisRunStatus = "pending" | "running" | "done" | "error";

export interface AnalysisRunProgress {
  key: string;
  name: string;
  progress: number;
  status: AnalysisRunStatus;
  currentStep: string;
  lastMessage?: string;
  updatedAt: number;
}

interface UseAnalysisRunnerProps {
  apiModel: string;
  onDone: (result: CompanyAnalysis) => void;
  onError: (message: string) => void;
}

export function useAnalysisRunner({ apiModel, onDone, onError }: UseAnalysisRunnerProps) {
  const [activeAnalysisKeys, setActiveAnalysisKeys] = useState<Set<string>>(() => new Set());
  const activeAnalysisKeysRef = useRef<Set<string>>(new Set());
  const activeAnalysisJobIdsRef = useRef<Set<string>>(new Set());
  const [activeAnalysisNames, setActiveAnalysisNames] = useState<string[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<Record<string, AnalysisRunProgress>>({});
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [logsVisible, setLogsVisible] = useState(false);
  const [error, setError] = useState("");

  const isAnalyzing = activeAnalysisKeys.size > 0;
  const isCompanyAnalyzing = useCallback(
    (name: string) => activeAnalysisKeys.has(normalizeCompanyKey(name)),
    [activeAnalysisKeys],
  );

  const analysisProgressItems = useMemo(
    () => Object.values(analysisProgress).sort((a, b) => a.updatedAt - b.updatedAt),
    [analysisProgress],
  );

  const progressPercent = useMemo(() => {
    if (analysisProgressItems.length === 0) return 0;
    const total = analysisProgressItems.reduce((sum, item) => sum + item.progress, 0);
    return Math.round(total / analysisProgressItems.length);
  }, [analysisProgressItems]);

  const markAnalysisStarted = useCallback((name: string, restored = false) => {
    const normalizedKey = normalizeCompanyKey(name);
    if (!normalizedKey || activeAnalysisKeysRef.current.has(normalizedKey)) return false;
    const startsNewBatch = activeAnalysisKeysRef.current.size === 0;
    if (startsNewBatch) {
      setAnalysisProgress({});
      setProgressLogs([]);
    }
    activeAnalysisKeysRef.current.add(normalizedKey);
    setActiveAnalysisKeys((prev) => new Set(prev).add(normalizedKey));
    setActiveAnalysisNames((prev) => prev.includes(name) ? prev : [...prev, name]);
    setAnalysisProgress((prev) => ({
      ...prev,
      [normalizedKey]: {
        key: normalizedKey,
        name,
        progress: restored ? 5 : 2,
        status: restored ? "running" : "pending",
        currentStep: restored ? "진행 상태 복원" : "요청 접수",
        updatedAt: Date.now(),
      },
    }));
    setProgressLogs((prev) => [
      ...prev,
      prev.length
        ? `--- ${name} ${restored ? "분석 진행 상태 복원" : "분석 요청"} ---`
        : `${name} ${restored ? "분석 진행 상태 복원" : "분석 요청"}`,
    ]);
    setError("");
    return true;
  }, []);

  const markAnalysisFinished = useCallback((name: string) => {
    const normalizedKey = normalizeCompanyKey(name);
    activeAnalysisKeysRef.current.delete(normalizedKey);
    setActiveAnalysisKeys((prev) => {
      const next = new Set(prev);
      next.delete(normalizedKey);
      return next;
    });
    setActiveAnalysisNames((prev) => prev.filter((n) => normalizeCompanyKey(n) !== normalizedKey));
  }, []);

  const handleAnalysisEvent = useCallback((name: string, ev: AnalyzeProgressEvent) => {
    const normalizedKey = normalizeCompanyKey(name);
    setAnalysisProgress((prev) => {
      const current = prev[normalizedKey] ?? {
        key: normalizedKey, name, progress: 0,
        status: "running" as AnalysisRunStatus, currentStep: "진행 중", updatedAt: Date.now(),
      };
      const nextProgress = estimateAnalysisProgress(ev, current.progress);
      const nextStatus: AnalysisRunStatus =
        ev.type === "done" ? "done" : ev.type === "error" ? "error" : "running";
      return {
        ...prev,
        [normalizedKey]: {
          ...current, name, progress: nextProgress, status: nextStatus,
          currentStep: getAnalysisStepLabel(ev, current.currentStep),
          lastMessage: "message" in ev ? ev.message ?? current.lastMessage : current.lastMessage,
          updatedAt: Date.now(),
        },
      };
    });

    if (ev.type === "log") {
      setProgressLogs((p) => [...p, `[${name}] ${ev.message}`]);
    } else if (ev.type === "searching") {
      setProgressLogs((p) => [...p, `[${name}] 외부 데이터 수집 및 웹 검색 진행 중`]);
    } else if (ev.type === "scoring") {
      setProgressLogs((p) => [...p, `[${name}] 인재상 기반 역량 모델 분석 처리 중`]);
    } else if (ev.type === "done") {
      onDone(ev.result);
    } else if (ev.type === "error") {
      const msg = `[${name}] ${ev.message}`;
      setError(msg);
      onError(msg);
    }
  }, [onDone, onError]);

  const runAnalysis = useCallback(async (name: string) => {
    const normalizedKey = normalizeCompanyKey(name);
    if (!name || !normalizedKey || !markAnalysisStarted(name)) return;
    try {
      await analyzeCompanyStream(name, apiModel || undefined, (ev) => handleAnalysisEvent(name, ev));
    } catch (e) {
      const message = e instanceof Error ? e.message : "분석 처리 중 오류가 발생했습니다.";
      const fullMsg = `[${name}] ${message}`;
      setError(fullMsg);
      onError(fullMsg);
      setAnalysisProgress((prev) => {
        const current = prev[normalizedKey];
        if (!current) return prev;
        return {
          ...prev,
          [normalizedKey]: { ...current, status: "error", currentStep: "오류", lastMessage: message, updatedAt: Date.now() },
        };
      });
    } finally {
      markAnalysisFinished(name);
    }
  }, [apiModel, markAnalysisStarted, markAnalysisFinished, handleAnalysisEvent, onError]);

  // 페이지 진입 시 진행 중인 큐 작업 복원
  useEffect(() => {
    const controllers: AbortController[] = [];
    let cancelled = false;

    getQueueStatus()
      .then((status) => {
        if (cancelled) return;
        const activeJobs = status.jobs.filter(
          (j) => j.taskType === "companyanalysis" && (j.status === "pending" || j.status === "running"),
        );
        const failedJobs = status.jobs.filter(
          (j) => j.taskType === "companyanalysis" && j.status === "error",
        );

        if (failedJobs.length > 0) {
          const latest = failedJobs[failedJobs.length - 1];
          const companyName = latest.companyName || latest.displayTitle?.replace(/\s*기업 분석\s*$/, "").trim() || "기업";
          const message = latest.errorMessage || latest.result || "분석 처리 중 오류가 발생했습니다.";
          const fullMsg = `[${companyName}] ${message}`;
          setError(fullMsg);
          setProgressLogs((prev) => [...prev, `[${companyName}] 오류: ${message}`]);
          const key = normalizeCompanyKey(companyName);
          if (key) {
            setAnalysisProgress((prev) => ({
              ...prev,
              [key]: { key, name: companyName, progress: 0, status: "error", currentStep: "오류", lastMessage: message, updatedAt: Date.now() },
            }));
          }
        }

        for (const job of activeJobs) {
          if (activeAnalysisJobIdsRef.current.has(job.jobId)) continue;
          const companyName = job.companyName || job.displayTitle?.replace(/\s*기업 분석\s*$/, "").trim() || "기업";
          activeAnalysisJobIdsRef.current.add(job.jobId);
          markAnalysisStarted(companyName, true);

          const controller = new AbortController();
          controllers.push(controller);

          streamCompanyAnalysisJob(job.jobId, (ev) => handleAnalysisEvent(companyName, ev), controller.signal)
            .catch((e) => {
              if (!controller.signal.aborted) {
                const message = e instanceof Error ? e.message : "분석 스트림 복원 중 오류가 발생했습니다.";
                const fullMsg = `[${companyName}] ${message}`;
                setError(fullMsg);
                const key = normalizeCompanyKey(companyName);
                setAnalysisProgress((prev) => {
                  const current = prev[key];
                  if (!current) return prev;
                  return { ...prev, [key]: { ...current, status: "error", currentStep: "오류", lastMessage: message, updatedAt: Date.now() } };
                });
              }
            })
            .finally(() => {
              activeAnalysisJobIdsRef.current.delete(job.jobId);
              markAnalysisFinished(companyName);
            });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, []);

  return {
    activeAnalysisKeys,
    activeAnalysisNames,
    analysisProgress,
    analysisProgressItems,
    progressPercent,
    progressLogs,
    logsVisible,
    setLogsVisible,
    error,
    setError,
    isAnalyzing,
    isCompanyAnalyzing,
    runAnalysis,
  };
}
