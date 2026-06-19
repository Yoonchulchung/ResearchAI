import { randomUUID } from 'crypto';
import type { ResumeTarget, ResumeSelfIntro, AnyProfile } from './resume.types';

export function safeId(id?: string): string {
  const value = id?.trim();
  return value || randomUUID();
}

export function emptyToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeDate(value?: string | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dotSlash = v.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (dotSlash)
    return `${dotSlash[1]}-${dotSlash[2].padStart(2, '0')}-${dotSlash[3].padStart(2, '0')}`;
  const compact = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const partial = v.match(/^(\d{4})[.\-/](\d{1,2})$/);
  if (partial) return `${partial[1]}-${partial[2].padStart(2, '0')}-01`;
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  return v;
}

export function parseCategory(value?: string | null): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Legacy comma-separated values.
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stringifyCategory(value?: string[] | string | null): string | null {
  if (!value) return null;
  const categories = Array.isArray(value)
    ? value
    : value.split(',').map((item) => item.trim());
  const normalized = [
    ...new Set(categories.map((item) => item.trim()).filter(Boolean)),
  ];
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function sortByOrder<T extends { orderIndex: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function safeFilename(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  return normalized || 'resume';
}

export function escapeHtml(value?: string | null): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeLineBreaks(value?: string | null): string {
  return (value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n');
}

export function normalizeTargets(body: AnyProfile): ResumeTarget[] {
  if (body.resume?.length) return body.resume;

  const existingTargets = body.resumeTargets?.length ? body.resumeTargets : [];
  if (existingTargets.length > 0) {
    return existingTargets.map((target) => ({
      ...target,
      selfIntroductions: target.selfIntroductions ?? target.coverLetters ?? [],
    }));
  }

  const intros = body.selfIntroductions ?? [];
  if (intros.length > 0) {
    const grouped = new Map<string, ResumeTarget>();
    for (const intro of intros) {
      const key = [intro.companyName ?? '', intro.jobTitle ?? '', intro.jd ?? ''].join('\n');
      const current: ResumeTarget = grouped.get(key) ?? {
        id: safeId(),
        companyName: intro.companyName ?? '',
        jobTitle: intro.jobTitle ?? '',
        jd: intro.jd ?? '',
        selfIntroductions: [],
      };
      current.selfIntroductions?.push(intro as ResumeSelfIntro);
      grouped.set(key, current);
    }
    return [...grouped.values()];
  }

  return [{ id: safeId(), companyName: '', jobTitle: '', appliedAt: '', jd: '', selfIntroductions: [] }];
}

export function buildVersionSnapshot(target: ResumeTarget): ResumeTarget {
  const selfIntroductions = target.selfIntroductions ?? target.coverLetters ?? [];
  return {
    id: target.id,
    companyName: target.companyName ?? '',
    jobTitle: target.jobTitle ?? '',
    appliedAt: target.appliedAt ?? target.applyDate ?? '',
    jd: target.jd ?? '',
    selfIntroductions: selfIntroductions.map((item) => ({
      id: item.id,
      question: item.question ?? item.title ?? '',
      answer: item.answer ?? '',
      category: parseCategory(stringifyCategory(item.category)),
      refinedTitle: item.refinedTitle ?? null,
    })),
    experiences: (target.experiences ?? []).map((item) => ({
      id: item.id,
      activityType: item.activityType ?? '',
      organizationName: item.organizationName ?? '',
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      role: item.role ?? null,
      description: item.description ?? null,
    })),
    prizes: (target.prizes ?? []).map((item) => ({
      id: item.id,
      title: item.title ?? '',
      organization: item.organization ?? '',
      issuedDate: item.issuedDate ?? null,
      description: item.description ?? null,
    })),
    trainings: (target.trainings ?? []).map((item) => ({
      id: item.id,
      title: item.title ?? '',
      institution: item.institution ?? '',
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      hours: item.hours ?? null,
      description: item.description ?? null,
    })),
  };
}
