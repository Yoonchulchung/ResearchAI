import { Injectable } from '@nestjs/common';
import { WebSearchService } from 'src/research/application/web-search.service';
import { Competitor } from 'src/company/domain/company-analysis.types';
import {
  parseSearchLinks,
  isNaverBlog,
  getDefaultSearchSourceText,
  normalizeName,
  normalizeUrl,
  getHost,
} from './company-analysis.utils';

@Injectable()
export class CompanyAnalysisHrTechService {
  constructor(private readonly webSearch: WebSearchService) {}

  async collectHrTechContext(
    companyName: string,
    officialWebsiteUrl: string | null,
  ): Promise<{
    context: string;
    sources: { category: string; title: string; url: string }[];
  }> {
    const officialHost = getHost(officialWebsiteUrl);
    const officialSiteQuery = officialHost ? `site:${officialHost}` : '';
    const categories = [
      {
        label: '테크 블로그',
        queries: [
          officialSiteQuery
            ? `"${companyName}" ${officialSiteQuery} 테크 블로그 기술 블로그 engineering blog developer`
            : '',
          `"${companyName}" 테크 블로그 기술 블로그 engineering blog`,
          `"${companyName}" 개발자 블로그 기술문화`,
        ].filter(Boolean),
      },
      {
        label: '오픈소스·GitHub',
        queries: [
          officialSiteQuery
            ? `"${companyName}" ${officialSiteQuery} GitHub open source 오픈소스`
            : '',
          `"${companyName}" GitHub open source`,
          `"${companyName}" 오픈소스 기여 GitHub`,
        ].filter(Boolean),
      },
      {
        label: '컨퍼런스·커뮤니티',
        queries: [
          officialSiteQuery
            ? `"${companyName}" ${officialSiteQuery} 컨퍼런스 발표 개발자 커뮤니티 세미나`
            : '',
          `"${companyName}" 컨퍼런스 발표 개발자 커뮤니티`,
          `"${companyName}" meetup seminar tech conference developer`,
        ].filter(Boolean),
      },
      {
        label: '기술 스택·아키텍처',
        queries: [
          officialSiteQuery
            ? `"${companyName}" ${officialSiteQuery} 기술 스택 아키텍처 클라우드 개발`
            : '',
          `"${companyName}" 기술 스택 아키텍처 마이크로서비스 클라우드 Kubernetes`,
          `"${companyName}" architecture modernization tech stack`,
        ].filter(Boolean),
      },
      {
        label: '기술 인터뷰',
        queries: [
          officialSiteQuery
            ? `"${companyName}" ${officialSiteQuery} 기술 인터뷰 개발자 인터뷰 CTO`
            : '',
          `"${companyName}" 기술 인터뷰 개발자 인터뷰 CTO`,
          `"${companyName}" engineering interview developer interview`,
        ].filter(Boolean),
      },
    ];

    const contextParts: string[] = [];
    const allSources: { category: string; title: string; url: string }[] = [];

    for (const category of categories) {
      const categoryContexts: string[] = [];
      for (const query of category.queries) {
        const { context, sources } = await this.webSearch.runSearch(query);
        const sourceText = getDefaultSearchSourceText(sources);
        if (context?.trim())
          categoryContexts.push(
            `#### 검색어: ${query}\n${context.slice(0, 3500)}`,
          );
        allSources.push(
          ...parseSearchLinks(sourceText)
            .filter((s) => s.title && !isNaverBlog(s.url))
            .map((s) => ({
              category: category.label,
              title: s.title,
              url: s.url,
            })),
        );
      }
      if (categoryContexts.length) {
        contextParts.push(
          `### ${category.label}\n${categoryContexts.join('\n\n')}`,
        );
      }
    }

    return {
      context: contextParts.join('\n\n---\n\n').slice(0, 22000),
      sources: this.uniqueHrTechSources(allSources).slice(0, 20),
    };
  }

  isVerifiedCompetitor(
    competitor: Competitor,
    companyName: string,
    competitorContext: string,
    competitorSources: { title: string; url: string }[],
  ): boolean {
    if (!competitor.name) return false;
    if (normalizeName(competitor.name) === normalizeName(companyName))
      return false;
    if (!competitor.marketScope) return false;
    if (!competitor.sourceUrl) return false;

    const normalizedSourceUrl = normalizeUrl(competitor.sourceUrl);
    const hasKnownSource = competitorSources.some(
      (source) => normalizeUrl(source.url) === normalizedSourceUrl,
    );
    if (!hasKnownSource) return false;

    const normalizedContext = normalizeName(
      `${competitorContext}\n${competitorSources.map((s) => s.title).join('\n')}`,
    );
    const normalizedCompetitorName = normalizeName(competitor.name);
    return (
      Boolean(normalizedCompetitorName) &&
      normalizedContext.includes(normalizedCompetitorName)
    );
  }

  private uniqueHrTechSources(
    sources: { category: string; title: string; url: string }[],
  ): { category: string; title: string; url: string }[] {
    const seen = new Set<string>();
    const unique: { category: string; title: string; url: string }[] = [];
    for (const source of sources) {
      const key = normalizeUrl(source.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push({
        category: source.category,
        title: source.title,
        url: source.url,
      });
    }
    return unique;
  }
}
