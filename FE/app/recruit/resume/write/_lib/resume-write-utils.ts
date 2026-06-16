import type {
  ResumeProfile,
  ResumeSelfIntro,
  ResumeTarget,
} from "@/lib/api/resume";

export function uid() {
  return Math.random().toString(36).slice(2);
}

const RESUME_DRAFT_CACHE_PREFIX = "research-ai:resume-write:draft:";
const RESUME_DRAFT_CACHE_VERSION = 1;
export const RESUME_DRAFT_CACHE_TTL_MS = 30 * 60 * 1000;

export interface ResumeDraftCache {
  version: number;
  routeKey: string;
  profile: ResumeProfile;
  activeTargetId: string | null;
  serverUpdatedAt: string | null;
  cachedAt: number;
  expiresAt: number;
}

function cacheKeyFor(routeKey: string) {
  return `${RESUME_DRAFT_CACHE_PREFIX}${routeKey}`;
}

export function getTargetServerUpdatedAt(profile: ResumeProfile, targetId: string | null): string | null {
  const target = targetId
    ? profile.resumeTargets.find((item) => item.id === targetId)
    : profile.resumeTargets[0];
  return target?.updatedAt ?? null;
}

export function readResumeDraftCache(routeKey: string): ResumeDraftCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKeyFor(routeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeDraftCache;
    if (parsed.version !== RESUME_DRAFT_CACHE_VERSION || parsed.routeKey !== routeKey) {
      window.localStorage.removeItem(cacheKeyFor(routeKey));
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(cacheKeyFor(routeKey));
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(cacheKeyFor(routeKey));
    return null;
  }
}

export function writeResumeDraftCache(routeKey: string, profile: ResumeProfile, activeTargetId: string | null) {
  if (typeof window === "undefined" || profile.resumeTargets.length === 0) return;
  const cachedAt = Date.now();
  const payload: ResumeDraftCache = {
    version: RESUME_DRAFT_CACHE_VERSION,
    routeKey,
    profile,
    activeTargetId,
    serverUpdatedAt: getTargetServerUpdatedAt(profile, activeTargetId),
    cachedAt,
    expiresAt: cachedAt + RESUME_DRAFT_CACHE_TTL_MS,
  };
  try {
    window.localStorage.setItem(cacheKeyFor(routeKey), JSON.stringify(payload));
  } catch {
    // localStorage quota or privacy mode. Draft cache is best-effort.
  }
}

export function clearResumeDraftCache(routeKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(cacheKeyFor(routeKey));
}

export function shouldUseDraftCache(draft: ResumeDraftCache | null, serverUpdatedAt: string | null) {
  if (!draft) return false;
  const serverTime = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0;
  return draft.cachedAt > serverTime;
}

export function formatVersionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장 시각 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export type SelfIntroSnapshot = Map<string, string>;

export function snapshotSelfIntros(selfIntros: ResumeSelfIntro[]): SelfIntroSnapshot {
  return new Map(selfIntros.map((si) => [si.id, `${si.question}\x00${si.answer}`]));
}

export function diffSelfIntros(saved: SelfIntroSnapshot, current: ResumeSelfIntro[]): string[] {
  return current
    .filter((si) => {
      const fp = `${si.question}\x00${si.answer}`;
      return saved.get(si.id) !== fp && (si.question.trim() || si.answer.trim());
    })
    .map((si) => si.id);
}

export function createResumeTarget(): ResumeTarget {
  return {
    id: uid(),
    companyName: "",
    jobTitle: "",
    appliedAt: "",
    jd: "",
    selfIntroductions: [],
    experiences: [],
    prizes: [],
    trainings: [],
  };
}

export function normalizeResumeProfile(profile: ResumeProfile | null): ResumeProfile {
  if (profile?.resumeTargets?.length) return profile;
  return { resumeTargets: [createResumeTarget()] };
}
