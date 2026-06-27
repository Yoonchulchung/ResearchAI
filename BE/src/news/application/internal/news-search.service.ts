import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { BrowserService } from 'src/browse/application/browser.service';
import { DEFAULT_AI_MODEL } from 'src/shared/request-context';
import {
  QueryNewsItem,
  QueryNewsResult,
  RoadmapExpandResult,
  SearchRoadmapMonth,
  SearchRoadmapResult,
} from 'src/news/application/news.types';

const ROADMAP_SYSTEM_PROMPT = `너는 뉴스를 분석해 월별 주요 이벤트를 추출하는 전문가다.
규칙:
- 각 월당 최대 4개 이벤트 (중요도 높은 순)
- category: "정책·제도" "사건·사고" "경제·산업" "기술·과학" "외교·안보" "사회·문화" "인물·동향" 중 하나
- summary: 구체적 내용 1~2줄
- type: "event"|"policy"|"economy"|"tech"|"international"|"social"|"person" 중 하나
- importance: "high"|"medium"|"low" 중 하나
- sourceIndex: 해당 이벤트를 대표하는 새 뉴스 번호 (1-based)
출력은 JSON만:
{"months":[{"yearMonth":"YYYY-MM","events":[{"category":"","summary":"","type":"","importance":"","sourceIndex":1}]}]}`;

@Injectable()
export class NewsSearchService {
  private readonly logger = new Logger(NewsSearchService.name);

  constructor(
    private readonly browser: BrowserService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async getRoadmap(query: string): Promise<SearchRoadmapResult> {
    // 웹 검색 + Naver 뉴스 병렬 실행 (Naver 뉴스는 날짜 포함)
    const [webRaw, naverRaw] = await Promise.allSettled([
      this.browser
        .search(`${query} 뉴스`, 20, 0, { includeImages: false })
        .catch(
          () => [] as Array<{ title: string; url: string; snippet: string }>,
        ),
      this.getQueryNews(query, 1),
    ]);

    const webItems = (webRaw.status === 'fulfilled' ? webRaw.value : []).filter(
      (i) => i.title,
    );
    const naverItems = (
      naverRaw.status === 'fulfilled' ? naverRaw.value.items : []
    ).slice(0, 15);

    // URL 기준 중복 제거: Naver 우선(날짜 있음), 웹 보완
    const seen = new Set(naverItems.map((n) => n.url));
    const dedupedWeb = webItems.filter((w) => !seen.has(w.url));

    // 날짜 있는 Naver 먼저, 웹 뒤에 — 합산 최대 30건
    type Item = {
      title: string;
      url: string;
      snippet: string;
      date?: string | null;
    };
    const merged: Item[] = [
      ...naverItems.map((n) => ({
        title: n.title,
        url: n.url,
        snippet: n.snippet,
        date: n.publishedAt,
      })),
      ...dedupedWeb,
    ].slice(0, 30);

    if (!merged.length) {
      return { months: [], newsCount: 0, query, model: '' };
    }

    const newsText = merged
      .map((item, index) => {
        const datePart = item.date ? ` (${item.date.substring(0, 10)})` : '';
        return `[${index + 1}] ${item.title}${datePart}\n${item.snippet ?? ''}`;
      })
      .join('\n\n');

    try {
      const result = await this.analyzeRoadmap(
        `주제: "${query}"\n\n관련 뉴스 (날짜 포함, 최신순 반영):\n${newsText}`,
        merged,
        'search-roadmap',
      );
      return {
        months: result.months,
        newsCount: merged.length,
        query,
        model: result.model,
      };
    } catch (error) {
      this.logger.warn(`Search roadmap AI failed: ${(error as Error).message}`);
      return { months: [], newsCount: merged.length, query, model: '' };
    }
  }

  async getQueryNews(
    query: string,
    start = 1,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<QueryNewsResult> {
    try {
      const items = await this.browser.searchNews({
        query,
        start,
        dateFrom,
        dateTo,
      });

      const seen = new Set<string>();
      const deduplicated = items.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });

      return {
        items: deduplicated.map((item) => ({
          ...item,
          imageUrl: item.imageUrl,
        })),
        hasMore: deduplicated.length >= 9,
        nextStart: start + 10,
      };
    } catch (error) {
      this.logger.warn(`getQueryNews failed: ${(error as Error).message}`);
      return { items: [], hasMore: false, nextStart: start };
    }
  }

  async expandRoadmap(
    query: string,
    direction: 'newer' | 'older',
    referenceDate: string,
    existingMonths: SearchRoadmapMonth[],
  ): Promise<RoadmapExpandResult> {
    const { dateFrom, dateTo } = this.expansionRange(direction, referenceDate);
    const items = await this.collectQueryNews(query, dateFrom, dateTo);

    if (!items.length) {
      return {
        months: existingMonths,
        newsCount: 0,
        query,
        model: '',
        addedCount: 0,
      };
    }

    const newsText = items
      .map(
        (item, index) =>
          `[${index + 1}] ${item.title}${item.publishedAt ? ` (${item.publishedAt})` : ''}\n${item.snippet}`,
      )
      .join('\n\n');
    const prompt = `주제: "${query}"
기존 타임라인: ${JSON.stringify({ months: existingMonths })}
새로 수집된 뉴스 (${direction === 'older' ? '이전' : '이후'} 기간):
${newsText}

기존 이벤트는 유지하고 새 뉴스로부터 새로운 월 또는 이벤트를 보완해줘.`;

    try {
      const result = await this.analyzeRoadmap(prompt, items, 'roadmap-expand');
      return {
        months: result.months,
        newsCount: items.length,
        query,
        model: result.model,
        addedCount: items.length,
      };
    } catch (error) {
      this.logger.warn(`expandRoadmap AI failed: ${(error as Error).message}`);
      return {
        months: existingMonths,
        newsCount: items.length,
        query,
        model: '',
        addedCount: items.length,
      };
    }
  }

  private async analyzeRoadmap(
    prompt: string,
    sources: Array<{ title: string; url: string }>,
    caller: string,
  ): Promise<{ months: SearchRoadmapMonth[]; model: string }> {
    const model = DEFAULT_AI_MODEL();
    const effectiveModel = this.aiProvider.resolveEffectiveModel(model);
    const { text } = await this.aiProvider.call(
      model,
      ROADMAP_SYSTEM_PROMPT,
      prompt,
      { caller },
    );
    const parsed = JSON.parse(
      text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim(),
    ) as { months?: SearchRoadmapMonth[] };

    return {
      months: (parsed.months ?? []).map((month) => ({
        ...month,
        events: month.events.map((event) => ({
          ...event,
          sourceUrl: sources[(event.sourceIndex ?? 1) - 1]?.url,
          sourceTitle: sources[(event.sourceIndex ?? 1) - 1]?.title,
        })),
      })),
      model: effectiveModel,
    };
  }

  private async collectQueryNews(
    query: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<QueryNewsItem[]> {
    const items: QueryNewsItem[] = [];
    for (let start = 1; start <= 21; start += 10) {
      const result = await this.getQueryNews(query, start, dateFrom, dateTo);
      items.push(...result.items);
      if (!result.hasMore) break;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return items;
  }

  private expansionRange(
    direction: 'newer' | 'older',
    referenceDate: string,
  ): { dateFrom: string; dateTo: string } {
    const reference = new Date(referenceDate);
    if (direction === 'older') {
      const to = new Date(reference);
      to.setDate(to.getDate() - 1);
      const from = new Date(to);
      from.setMonth(from.getMonth() - 3);
      return {
        dateFrom: from.toISOString().substring(0, 10),
        dateTo: to.toISOString().substring(0, 10),
      };
    }

    const from = new Date(reference);
    from.setDate(from.getDate() + 1);
    return {
      dateFrom: from.toISOString().substring(0, 10),
      dateTo: new Date().toISOString().substring(0, 10),
    };
  }
}
