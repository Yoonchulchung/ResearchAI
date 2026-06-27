import { Inject, Injectable, Logger } from '@nestjs/common';
import { BrowserWebSearchResult } from 'src/browse/application/browser.types';
import {
  buildCompanyNameSearchCandidates,
  buildCompanySearchQuery,
  isCompanyNameMatch,
} from 'src/company/application/info/company-name-search.util';
import { COMPANY_PROFILE_URL_SEARCH_PORT } from 'src/company/application/info/company-profile-url-search.port';
import type { CompanyProfileUrlSearchPort } from 'src/company/application/info/company-profile-url-search.port';

export interface CompanyProfileUrlSearchProfile {
  source: string;
  domains: string[];
  keywords: string[];
  preferredPathPatterns?: RegExp[];
  rejectPathPatterns?: RegExp[];
}

@Injectable()
export class CompanyProfileUrlResolverService {
  private readonly logger = new Logger(CompanyProfileUrlResolverService.name);

  constructor(
    @Inject(COMPANY_PROFILE_URL_SEARCH_PORT)
    private readonly search: CompanyProfileUrlSearchPort,
  ) {}

  async findUrl(
    companyName: string,
    profile: CompanyProfileUrlSearchProfile,
  ): Promise<string | null> {
    const results = await this.searchCandidates(companyName, profile);
    const ranked = results
      .map((result) => ({
        result,
        score: this.scoreResult(companyName, profile, result),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.result.url ?? null;
  }

  private async searchCandidates(
    companyName: string,
    profile: CompanyProfileUrlSearchProfile,
  ): Promise<BrowserWebSearchResult[]> {
    const base =
      buildCompanyNameSearchCandidates(companyName)[0] ?? companyName;
    const sourceName = profile.source;
    const primaryDomain = profile.domains[0];
    const queries = [
      `${base} ${profile.keywords.join(' ')}`,
      `${base} ${sourceName}`,
      `${base} ${sourceName} company`,
      `${base} site:${primaryDomain}`,
      buildCompanySearchQuery(
        companyName,
        `site:${primaryDomain} ${profile.keywords.join(' ')}`,
      ),
      buildCompanySearchQuery(
        companyName,
        `site:${primaryDomain} ${sourceName}`,
      ),
      ...buildCompanyNameSearchCandidates(companyName)
        .slice(0, 4)
        .flatMap((candidate) => [
          `"${candidate}" ${profile.keywords.join(' ')}`,
          `"${candidate}" ${sourceName}`,
        ]),
    ];

    const seenQuery = new Set<string>();
    const seenUrl = new Set<string>();
    const merged: BrowserWebSearchResult[] = [];

    for (const query of queries) {
      if (seenQuery.has(query)) continue;
      seenQuery.add(query);
      try {
        const results = await this.search.searchWeb(query, 10);
        for (const result of results) {
          const normalizedUrl = this.normalizeUrl(result.url);
          if (!normalizedUrl || seenUrl.has(normalizedUrl)) continue;
          seenUrl.add(normalizedUrl);
          merged.push({ ...result, url: normalizedUrl });
        }
        if (
          merged.some(
            (result) => this.scoreResult(companyName, profile, result) >= 60,
          )
        ) {
          break;
        }
      } catch (error) {
        this.logger.warn(
          `[${profile.source}] 검색 실패 - "${query}": ${(error as Error).message}`,
        );
      }
    }

    return merged;
  }

  private scoreResult(
    companyName: string,
    profile: CompanyProfileUrlSearchProfile,
    result: BrowserWebSearchResult,
  ): number {
    const parsed = this.parseUrl(result.url);
    if (!parsed) return 0;

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (
      !profile.domains.some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      )
    ) {
      return 0;
    }

    const path = decodeURIComponent(parsed.pathname);
    if (profile.rejectPathPatterns?.some((pattern) => pattern.test(path))) {
      return 0;
    }

    const haystack = [result.title, result.snippet, path, result.url]
      .filter(Boolean)
      .join(' ');
    if (!isCompanyNameMatch(companyName, haystack)) return 0;

    let score = 60;
    if (profile.preferredPathPatterns?.some((pattern) => pattern.test(path))) {
      score += 20;
    }

    for (const keyword of profile.keywords) {
      if (haystack.toLowerCase().includes(keyword.toLowerCase())) score += 3;
    }

    return score;
  }

  private parseUrl(url: string): URL | null {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  private normalizeUrl(url: string): string | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;
    parsed.hash = '';
    return parsed.toString();
  }
}
