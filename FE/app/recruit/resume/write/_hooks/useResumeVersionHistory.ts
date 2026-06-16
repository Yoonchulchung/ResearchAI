import { useCallback, useState } from "react";
import {
  deleteResumeVersion,
  getResumeVersion,
  getResumeVersions,
  restoreResumeVersion,
  type ResumeProfile,
  type ResumeVersionDetail,
  type ResumeVersionSummary,
} from "@/lib/api/resume";

interface UseResumeVersionHistoryParams {
  activeTargetId: string | null;
  setProfile: (profile: ResumeProfile) => void;
  setActiveTargetId: (targetId: string | null) => void;
  onRestored?: (profile: ResumeProfile) => void;
}

export function useResumeVersionHistory({
  activeTargetId,
  setProfile,
  setActiveTargetId,
  onRestored,
}: UseResumeVersionHistoryParams) {
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionPreview, setVersionPreview] = useState<ResumeVersionDetail | null>(null);
  const [versionPreviewLoading, setVersionPreviewLoading] = useState(false);
  const [versionActionId, setVersionActionId] = useState<string | null>(null);
  const [versionError, setVersionError] = useState("");

  const loadVersionPreview = useCallback(async (resumeId: string, versionId: string) => {
    setSelectedVersionId(versionId);
    setVersionPreviewLoading(true);
    setVersionError("");
    try {
      setVersionPreview(await getResumeVersion(resumeId, versionId));
    } catch (error) {
      setVersionPreview(null);
      setVersionError(error instanceof Error ? error.message : "버전 내용을 불러오지 못했습니다.");
    } finally {
      setVersionPreviewLoading(false);
    }
  }, []);

  const loadVersions = useCallback(async (resumeId = activeTargetId) => {
    if (!resumeId) {
      setVersions([]);
      setSelectedVersionId(null);
      setVersionPreview(null);
      setVersionError("저장된 이력서를 선택해야 버전 기록을 볼 수 있습니다.");
      return;
    }

    setVersionsLoading(true);
    setVersionError("");
    try {
      const items = await getResumeVersions(resumeId);
      setVersions(items);
      const nextSelectedId = items.find((item) => item.id === selectedVersionId)?.id ?? items[0]?.id ?? null;
      if (nextSelectedId) {
        await loadVersionPreview(resumeId, nextSelectedId);
      } else {
        setSelectedVersionId(null);
        setVersionPreview(null);
      }
    } catch (error) {
      setVersions([]);
      setSelectedVersionId(null);
      setVersionPreview(null);
      setVersionError(error instanceof Error ? error.message : "버전 기록을 불러오지 못했습니다.");
    } finally {
      setVersionsLoading(false);
    }
  }, [activeTargetId, loadVersionPreview, selectedVersionId]);

  const openVersionHistory = useCallback(() => {
    setVersionPanelOpen(true);
    void loadVersions();
  }, [loadVersions]);

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    if (!activeTargetId) return;

    setVersionActionId(versionId);
    setVersionError("");
    try {
      const restoredProfile = await restoreResumeVersion(activeTargetId, versionId);
      setProfile(restoredProfile);
      setActiveTargetId(activeTargetId);
      onRestored?.(restoredProfile);
      await loadVersions(activeTargetId);
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : "버전 복원에 실패했습니다.");
    } finally {
      setVersionActionId(null);
    }
  }, [activeTargetId, loadVersions, onRestored, setActiveTargetId, setProfile]);

  const handleDeleteVersion = useCallback(async (versionId: string) => {
    if (!activeTargetId) return;

    setVersionActionId(versionId);
    setVersionError("");
    try {
      await deleteResumeVersion(activeTargetId, versionId);
      await loadVersions(activeTargetId);
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : "버전 기록 삭제에 실패했습니다.");
    } finally {
      setVersionActionId(null);
    }
  }, [activeTargetId, loadVersions]);

  return {
    handleDeleteVersion,
    handleRestoreVersion,
    loadVersionPreview,
    openVersionHistory,
    selectedVersionId,
    setVersionPanelOpen,
    versionActionId,
    versionError,
    versionPanelOpen,
    versionPreview,
    versionPreviewLoading,
    versions,
    versionsLoading,
  };
}
