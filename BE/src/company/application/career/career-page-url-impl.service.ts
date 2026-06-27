import { Injectable } from '@nestjs/common';

const CAREER_URL_PATTERNS = [
  'career',
  'careers',
  'recruit',
  'recruitment',
  'job',
  'jobs',
  'employment',
  'hiring',
  '채용',
];

const GENERIC_JOB_BOARD_HOSTS = [
  'saramin',
  'jobkorea',
  'wanted',
  'incruit',
  'linkareer',
  'catch.co',
  'jumpit',
  'rallit',
  'programmers',
  'rocketpunch',
];

@Injectable()
export class CareerPageUrlImplService {
  normalize(
    companyName: string,
    url: string | null | undefined,
    candidates: string[] = [],
    officialWebsiteUrl?: string | null,
  ): string | null {
    const normalizedCandidates = [url, ...candidates]
      .map((candidate) => this.normalizeUrl(candidate))
      .filter((candidate): candidate is string => Boolean(candidate));
    const uniqueCandidates = [...new Set(normalizedCandidates)];

    const careerCandidates = uniqueCandidates
      .filter((candidate) => this.isCareerUrl(candidate))
      .map((candidate) => ({
        url: candidate,
        score: this.scoreCareerUrl(candidate, companyName, officialWebsiteUrl),
      }))
      .sort((a, b) => b.score - a.score);

    if (careerCandidates[0]) return careerCandidates[0].url;

    return uniqueCandidates[0] ?? null;
  }

  private normalizeUrl(url: string | null | undefined): string | null {
    const trimmed = url?.trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(
        trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      );
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private isCareerUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return CAREER_URL_PATTERNS.some((pattern) => lower.includes(pattern));
  }

  private scoreCareerUrl(
    url: string,
    companyName: string,
    officialWebsiteUrl?: string | null,
  ): number {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const lowerUrl = url.toLowerCase();
    const officialRootDomain = this.getRootDomain(officialWebsiteUrl);
    const candidateRootDomain = this.getRootDomain(url);
    const companyTokens = this.extractCompanyTokens(companyName);

    let score = 0;
    if (officialRootDomain && candidateRootDomain === officialRootDomain)
      score += 80;
    if (
      companyTokens.some((token) => token.length >= 3 && host.includes(token))
    )
      score += 40;
    if (host.startsWith('career.') || host.startsWith('careers.')) score += 35;
    if (host.includes('career')) score += 25;
    if (host.startsWith('job.') || host.startsWith('jobs.')) score += 25;
    if (/\/job(?:s)?(?:\/|\.|$)/.test(path)) score += 25;
    if (path.includes('recruit') || path.includes('recruitment')) score += 15;
    if (host.includes('recruit')) score += 10;
    if (lowerUrl.includes('apply') || lowerUrl.includes('opening')) score += 8;
    if (GENERIC_JOB_BOARD_HOSTS.some((pattern) => host.includes(pattern)))
      score -= 80;

    return score;
  }

  private getHost(url: string): string | null {
    try {
      return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
        .replace(/^www\./, '')
        .toLowerCase();
    } catch {
      return null;
    }
  }

  private getRootDomain(url: string | null | undefined): string | null {
    const host = url ? this.getHost(url) : null;
    if (!host) return null;
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    return parts.slice(-2).join('.');
  }

  private extractCompanyTokens(companyName: string): string[] {
    return this.normalizeText(companyName)
      .split(/[^a-z0-9가-힣]+/)
      .filter(Boolean);
  }

  private normalizeText(value: string): string {
    return value.replace(/[\s()㈜주식회사]/g, '').toLowerCase();
  }
}
