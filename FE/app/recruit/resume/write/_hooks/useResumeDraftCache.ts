import { useCallback, useEffect, useRef } from "react";
import type { ResumeProfile } from "@/lib/api/resume";
import {
  RESUME_DRAFT_CACHE_TTL_MS,
  clearResumeDraftCache,
  writeResumeDraftCache,
} from "../_lib/resume-write-utils";

interface UseResumeDraftCacheParams {
  routeKey: string;
  enabled: boolean;
  loading: boolean;
  profile: ResumeProfile;
  activeTargetId: string | null;
  onDirty?: () => void;
  onStatusChange?: (message: string) => void;
}

export function useResumeDraftCache({
  routeKey,
  enabled,
  loading,
  profile,
  activeTargetId,
  onDirty,
  onStatusChange,
}: UseResumeDraftCacheParams) {
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);
  const draftFingerprintRef = useRef("");
  const latestProfileRef = useRef(profile);
  const latestActiveTargetIdRef = useRef(activeTargetId);

  const clearExpiryTimer = useCallback(() => {
    if (draftExpiryTimer.current) {
      clearTimeout(draftExpiryTimer.current);
      draftExpiryTimer.current = null;
    }
  }, []);

  const cancelPendingDraft = useCallback(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
  }, []);

  const scheduleDraftCacheExpiry = useCallback((expiresAt: number) => {
    clearExpiryTimer();
    const delay = Math.max(0, expiresAt - Date.now());
    draftExpiryTimer.current = setTimeout(() => {
      clearResumeDraftCache(routeKey);
      onStatusChange?.("");
      dirtyRef.current = false;
    }, delay);
  }, [clearExpiryTimer, onStatusChange, routeKey]);

  const markHydrationPending = useCallback(() => {
    hydratedRef.current = false;
    dirtyRef.current = false;
  }, []);

  const markDraftHydrated = useCallback((nextProfile: ResumeProfile) => {
    draftFingerprintRef.current = JSON.stringify(nextProfile);
    hydratedRef.current = true;
    dirtyRef.current = false;
  }, []);

  const clearDraft = useCallback((status = "") => {
    cancelPendingDraft();
    clearExpiryTimer();
    clearResumeDraftCache(routeKey);
    dirtyRef.current = false;
    onStatusChange?.(status);
  }, [cancelPendingDraft, clearExpiryTimer, onStatusChange, routeKey]);

  const markDraftClean = useCallback((nextProfile: ResumeProfile, status = "") => {
    draftFingerprintRef.current = JSON.stringify(nextProfile);
    hydratedRef.current = true;
    clearDraft(status);
  }, [clearDraft]);

  useEffect(() => {
    latestProfileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    latestActiveTargetIdRef.current = activeTargetId;
  }, [activeTargetId]);

  useEffect(() => {
    return () => {
      cancelPendingDraft();
      clearExpiryTimer();
      if (enabled && hydratedRef.current && dirtyRef.current) {
        writeResumeDraftCache(routeKey, latestProfileRef.current, latestActiveTargetIdRef.current);
      }
    };
  }, [cancelPendingDraft, clearExpiryTimer, enabled, routeKey]);

  useEffect(() => {
    if (!hydratedRef.current || loading || !enabled) return;

    const fingerprint = JSON.stringify(profile);
    if (fingerprint === draftFingerprintRef.current) return;

    dirtyRef.current = true;
    onDirty?.();
    onStatusChange?.("임시 저장 중...");

    cancelPendingDraft();
    draftTimer.current = setTimeout(() => {
      writeResumeDraftCache(routeKey, profile, activeTargetId);
      scheduleDraftCacheExpiry(Date.now() + RESUME_DRAFT_CACHE_TTL_MS);
      draftFingerprintRef.current = fingerprint;
      onStatusChange?.("임시 저장됨");
    }, 800);

    return cancelPendingDraft;
  }, [
    activeTargetId,
    cancelPendingDraft,
    enabled,
    loading,
    onDirty,
    onStatusChange,
    profile,
    routeKey,
    scheduleDraftCacheExpiry,
  ]);

  return {
    cancelPendingDraft,
    clearDraft,
    markDraftClean,
    markDraftHydrated,
    markHydrationPending,
    scheduleDraftCacheExpiry,
  };
}
