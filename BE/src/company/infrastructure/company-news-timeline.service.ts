import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { CompanyNewsTimelineEntity } from 'src/company/domain/entity/company-news-timeline.entity';
import { deduplicateNewsItems } from 'src/news/application/news-dedup.utils';

export interface TimelineEvent {
  category: string;
  summary: string;
  type: string | null;
  importance: string | null;
  sourceIndex?: number | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
}

export interface TimelineMonth {
  yearMonth: string;
  events: TimelineEvent[];
}

export interface NewsTimelineResult {
  months: TimelineMonth[];
  model: string;
  analyzedAt: string;
  newsCount: number;
  savedNewsCount: number;
  eligibleNewsCount: number;
  aiUsage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
    currency: 'USD';
  };
}

export type TimelineNewsUsageStatus =
  | 'used'
  | 'excluded_duplicate'
  | 'excluded_missing_date'
  | 'excluded_missing_title'
  | 'excluded_company_name'
  | 'excluded_month_limit';

export interface TimelineNewsSourceItem {
  id: string;
  title: string;
  url: string;
  snippet: string | null;
  source: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  yearMonth: string | null;
  usageStatus: TimelineNewsUsageStatus;
  usageReason: string;
  promptIndex: number | null;
  relatedEvents: {
    yearMonth: string;
    category: string;
    summary: string;
  }[];
}

export interface TimelineNewsSourcesResult {
  savedCount: number;
  eligibleCount: number;
  usedCount: number;
  excludedCount: number;
  items: TimelineNewsSourceItem[];
}

const SYSTEM_PROMPT = `너는 기업 뉴스 제목을 분석해 월별 사업 이벤트를 추출하는 전문가다.
규칙:
- 각 월당 최대 3개 이벤트 (중요도 높은 순)
- 주가·투자의견·목표가·애널리스트 관련 기사는 제외
- category: 반드시 아래 7개 대분류 중 하나만 선택. 새 카테고리 생성 금지.
  "AI·플랫폼"     — AI 서비스·모델·에이전트·자동화·로봇·솔루션
  "클라우드·인프라" — 클라우드·데이터센터·네트워크·인프라
  "사업수주"       — 수주·계약·납품·공급·구축
  "파트너십"       — MOU·협약·협업·합작·제휴
  "글로벌"         — 해외진출·수출·현지화·글로벌 사업
  "인재·조직"      — 채용·임원인사·조직개편·경영진
  "투자·M&A"      — 투자·인수·지분·펀딩·상장(IPO)
- summary: 구체적 사업 내용 1~2줄 (금액·기간·대상 포함)
- type: "product"|"contract"|"partner"|"invest"|"hr"|"risk"|"other" 중 하나
- importance: "high"|"medium"|"low" 중 하나
- sourceIndex: 해당 이벤트를 가장 잘 대표하는 뉴스의 번호 (반드시 제공)
출력은 JSON만, 다른 텍스트 없이.`;

@Injectable()
export class CompanyNewsTimelineService {
  private readonly logger = new Logger(CompanyNewsTimelineService.name);

  constructor(
    private readonly aiProvider: AiProviderService,
    @InjectRepository(CompanyNewsEntity)
    private readonly newsRepo: Repository<CompanyNewsEntity>,
    @InjectRepository(CompanyNewsTimelineEntity)
    private readonly timelineRepo: Repository<CompanyNewsTimelineEntity>,
  ) {}

  async analyze(
    companyId: string,
    companyName: string,
    model: string,
    incremental = false, // true: 새 월만 추가 / false: 전체 재분석
  ): Promise<NewsTimelineResult> {
    // 1. 기존 분석된 월 목록
    const existing = await this.timelineRepo.find({
      where: { companyId },
      select: ['yearMonth'],
    });
    const existingMonths = new Set(existing.map((e) => e.yearMonth));

    // 2. 모든 뉴스 가져오기 (publishedAt 있는 것만)
    const storedNews = await this.newsRepo.find({
      where: { companyId },
      order: { publishedAt: 'ASC', fetchedAt: 'ASC', id: 'ASC' },
    });
    const allNews = deduplicateNewsItems(storedNews);
    // 회사명이 제목에 없는 타사 기사 제거 (대소문자 무관)
    const nameLower = companyName.toLowerCase();
    const validNews = allNews.filter(
      (n) =>
        n.publishedAt && n.title && n.title.toLowerCase().includes(nameLower),
    );

    if (validNews.length === 0) {
      return {
        months: [],
        model,
        analyzedAt: new Date().toISOString(),
        newsCount: 0,
        savedNewsCount: storedNews.length,
        eligibleNewsCount: 0,
      };
    }

    // 3. 월별 그룹화 — incremental: 미분석 월만 / full: 전체
    const byMonth: Record<string, CompanyNewsEntity[]> = {};
    for (const news of validNews) {
      const ym = news.publishedAt!.substring(0, 7);
      if (incremental && existingMonths.has(ym)) continue; // 이미 분석된 월 건너뜀
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(news);
    }

    // 새로 분석할 월이 없으면 기존 데이터 반환
    const sortedMonths = Object.keys(byMonth).sort();
    if (sortedMonths.length === 0) {
      this.logger.log(`타임라인 증분 분석: 새 월 없음 — 기존 데이터 반환`);
      return this.getSaved(companyId, companyName);
    }

    // 4. AI 프롬프트 구성
    const monthBlocks = sortedMonths
      .map((ym) => {
        const newsItems = byMonth[ym].slice(0, 20);
        return `[${ym}]\n${newsItems.map((item, i) => `${i + 1}. ${item.title}`).join('\n')}`;
      })
      .join('\n\n');

    const prompt = `기업명: ${companyName}

아래 월별 뉴스 제목을 분석해 사업 이벤트를 추출해라.

${monthBlocks}

반환 JSON 형식:
{
  "${sortedMonths[0]}": [
    { "category": "AI·자동화", "summary": "...", "type": "product", "importance": "high", "sourceIndex": 1 }
  ]
}`;

    this.logger.log(
      `타임라인 분석(${incremental ? '증분' : '전체'}): ${companyName} / ${sortedMonths.length}개월 / ${validNews.length}건`,
    );

    const aiResult = await this.aiProvider.call(model, SYSTEM_PROMPT, prompt, {
      caller: 'CompanyNewsTimeline/analyze',
    });

    // 5. 파싱
    const parsed = this.parseResponse(aiResult.text, sortedMonths);

    // 6. DB 저장
    if (!incremental) {
      // 전체 재분석: 해당 월들만 삭제 후 재삽입 (다른 월 보존)
      for (const ym of sortedMonths) {
        await this.timelineRepo.delete({ companyId, yearMonth: ym });
      }
    }
    // incremental: 기존 데이터 유지, 새 월만 추가

    const entities: CompanyNewsTimelineEntity[] = [];
    for (const [ym, events] of Object.entries(parsed)) {
      for (const ev of events) {
        const sourceNews =
          typeof ev.sourceIndex === 'number'
            ? byMonth[ym]?.slice(0, 20)[ev.sourceIndex - 1]
            : undefined;
        entities.push(
          this.timelineRepo.create({
            id: randomUUID(),
            companyId,
            yearMonth: ym,
            category: ev.category,
            summary: ev.summary,
            type: ev.type || null,
            importance: ev.importance || null,
            sourceNewsId: sourceNews?.id ?? null,
            sourceTitle: sourceNews?.title ?? null,
            sourceUrl: sourceNews?.url ?? null,
            aiInputTokens: aiResult.inputTokens,
            aiOutputTokens: aiResult.outputTokens,
            aiEstimatedFees: aiResult.estimatedFees,
            model: this.aiProvider.resolveEffectiveModel(model),
          }),
        );
      }
    }

    if (entities.length) await this.timelineRepo.save(entities);

    this.logger.log(
      `타임라인 저장 완료: ${companyName} / ${entities.length}개 이벤트 (신규)`,
    );

    const saved = await this.getSaved(companyId, companyName);
    return {
      ...saved,
      aiUsage: {
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
        estimatedFees: aiResult.estimatedFees,
        currency: 'USD',
      },
    };
  }

  async getSaved(
    companyId: string,
    companyName?: string,
  ): Promise<NewsTimelineResult> {
    const rows = await this.timelineRepo.find({
      where: { companyId },
      order: { yearMonth: 'ASC' },
    });

    const newsRows = await this.newsRepo.find({
      where: { companyId },
      order: { publishedAt: 'ASC', fetchedAt: 'ASC', id: 'ASC' },
    });
    const sourceStats = this.classifyNewsSources(newsRows, companyName, rows);
    const latestAnalysisRow = [...rows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];
    const model = latestAnalysisRow?.model ?? '';
    const analyzedAt =
      latestAnalysisRow?.createdAt?.toISOString() ?? new Date().toISOString();
    const result = this.toResult(
      rows,
      model,
      sourceStats.usedCount,
      analyzedAt,
      newsRows,
      sourceStats.savedCount,
      sourceStats.eligibleCount,
    );

    if (
      latestAnalysisRow &&
      (latestAnalysisRow.aiInputTokens !== null ||
        latestAnalysisRow.aiOutputTokens !== null ||
        latestAnalysisRow.aiEstimatedFees !== null)
    ) {
      result.aiUsage = {
        inputTokens: latestAnalysisRow.aiInputTokens ?? 0,
        outputTokens: latestAnalysisRow.aiOutputTokens ?? 0,
        estimatedFees: latestAnalysisRow.aiEstimatedFees ?? 0,
        currency: 'USD',
      };
    }

    return result;
  }

  async getSources(
    companyId: string,
    companyName: string,
  ): Promise<TimelineNewsSourcesResult> {
    const [newsRows, timelineRows] = await Promise.all([
      this.newsRepo.find({
        where: { companyId },
        order: { publishedAt: 'DESC', fetchedAt: 'DESC' },
      }),
      this.timelineRepo.find({
        where: { companyId },
        order: { yearMonth: 'ASC' },
      }),
    ]);

    return this.classifyNewsSources(newsRows, companyName, timelineRows);
  }

  /** 구 프롬프트로 생성된 세분화 카테고리를 7개 대분류로 정규화 */
  private normalizeCategory(cat: string): string {
    // AI / AX / 생성형 / 에이전트 / 로봇 등 → AI·플랫폼
    if (/AI|AX|생성형|초거대|에이전트|에이전틱|피지컬|LLM|GPT|로봇/.test(cat))
      return 'AI·플랫폼';
    // 클라우드 / 데이터센터 / 보안 / 인프라
    if (/클라우드|데이터센터|인프라|보안|제로트러스트|네트워크/.test(cat))
      return '클라우드·인프라';
    // 글로벌 / 해외 / 수출
    if (/글로벌|해외|수출|베트남|싱가포르|진출|현지/.test(cat)) return '글로벌';
    // 파트너십 / 협력
    if (/파트너|협력|협약|MOU|협업|합작|제휴/.test(cat)) return '파트너십';
    // 투자 / M&A / 상장
    if (/투자|인수|M&A|상장|공시|IPO|지분|펀딩/.test(cat)) return '투자·M&A';
    // 인재 / 조직
    if (/인재|채용|임원|인사|조직|리더십|경영진/.test(cat)) return '인재·조직';
    // 수주 / 사업 / 솔루션 / B2B
    if (/수주|계약|솔루션|B2B|사업|납품|공급|구축|서비스/.test(cat))
      return '사업수주';
    // 이미 표준 카테고리면 그대로
    return cat;
  }

  private toResult(
    rows: CompanyNewsTimelineEntity[],
    model: string,
    newsCount: number,
    analyzedAt?: string,
    newsRows: CompanyNewsEntity[] = [],
    savedNewsCount = newsCount,
    eligibleNewsCount = newsCount,
  ): NewsTimelineResult {
    const newsByMonth = new Map<string, CompanyNewsEntity[]>();
    for (const news of newsRows) {
      if (!news.publishedAt || !news.title || !news.url) continue;
      const ym = news.publishedAt.substring(0, 7);
      const items = newsByMonth.get(ym) ?? [];
      items.push(news);
      newsByMonth.set(ym, items);
    }

    const byMonth: Record<string, TimelineEvent[]> = {};
    for (const row of rows) {
      if (!byMonth[row.yearMonth]) byMonth[row.yearMonth] = [];
      const fallbackSource =
        row.sourceUrl && row.sourceTitle
          ? null
          : this.findRepresentativeNews(
              row.summary,
              newsByMonth.get(row.yearMonth) ?? [],
            );
      byMonth[row.yearMonth].push({
        category: this.normalizeCategory(row.category),
        summary: row.summary,
        type: row.type,
        importance: row.importance,
        sourceTitle: row.sourceTitle ?? fallbackSource?.title ?? null,
        sourceUrl: row.sourceUrl ?? fallbackSource?.url ?? null,
      });
    }

    const months: TimelineMonth[] = Object.keys(byMonth)
      .sort()
      .map((ym) => ({ yearMonth: ym, events: byMonth[ym] }));

    return {
      months,
      model,
      analyzedAt:
        analyzedAt ??
        rows[0]?.createdAt?.toISOString() ??
        new Date().toISOString(),
      newsCount,
      savedNewsCount,
      eligibleNewsCount,
    };
  }

  private classifyNewsSources(
    newsRows: CompanyNewsEntity[],
    companyName?: string,
    timelineRows: CompanyNewsTimelineEntity[] = [],
  ): TimelineNewsSourcesResult {
    const nameLower = companyName?.trim().toLowerCase() ?? '';
    const uniqueNewsIds = new Set(
      deduplicateNewsItems(newsRows).map((news) => news.id),
    );
    const eligibleByMonth = new Map<string, CompanyNewsEntity[]>();

    for (const news of newsRows) {
      if (!uniqueNewsIds.has(news.id)) continue;
      if (!news.publishedAt || !news.title) continue;
      if (nameLower && !news.title.toLowerCase().includes(nameLower)) continue;
      const yearMonth = news.publishedAt.substring(0, 7);
      const items = eligibleByMonth.get(yearMonth) ?? [];
      items.push(news);
      eligibleByMonth.set(yearMonth, items);
    }

    const promptIndexById = new Map<string, number>();
    for (const items of eligibleByMonth.values()) {
      items
        .sort(
          (a, b) =>
            (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '') ||
            a.fetchedAt.getTime() - b.fetchedAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 20)
        .forEach((news, index) => promptIndexById.set(news.id, index + 1));
    }

    const relatedEventsByNewsId = new Map<
      string,
      TimelineNewsSourceItem['relatedEvents']
    >();
    for (const row of timelineRows) {
      if (!row.sourceNewsId) continue;
      const events = relatedEventsByNewsId.get(row.sourceNewsId) ?? [];
      events.push({
        yearMonth: row.yearMonth,
        category: this.normalizeCategory(row.category),
        summary: row.summary,
      });
      relatedEventsByNewsId.set(row.sourceNewsId, events);
    }

    const items = newsRows.map((news): TimelineNewsSourceItem => {
      const yearMonth = news.publishedAt?.substring(0, 7) ?? null;
      let usageStatus: TimelineNewsUsageStatus;
      let usageReason: string;

      if (!uniqueNewsIds.has(news.id)) {
        usageStatus = 'excluded_duplicate';
        usageReason = '같은 날짜의 유사한 제목 뉴스와 중복되어 제외';
      } else if (!news.publishedAt) {
        usageStatus = 'excluded_missing_date';
        usageReason = '게시일이 없어 월별 분석에서 제외';
      } else if (!news.title) {
        usageStatus = 'excluded_missing_title';
        usageReason = '제목이 없어 분석에서 제외';
      } else if (nameLower && !news.title.toLowerCase().includes(nameLower)) {
        usageStatus = 'excluded_company_name';
        usageReason = `제목에 회사명 "${companyName}"이 없어 제외`;
      } else if (!promptIndexById.has(news.id)) {
        usageStatus = 'excluded_month_limit';
        usageReason = '해당 월의 AI 입력 상한 20건을 초과해 제외';
      } else {
        usageStatus = 'used';
        usageReason = '월별 타임라인 AI 프롬프트에 제목 사용';
      }

      return {
        id: news.id,
        title: news.title,
        url: news.url,
        snippet: news.snippet,
        source: news.source,
        publishedAt: news.publishedAt,
        fetchedAt: news.fetchedAt.toISOString(),
        yearMonth,
        usageStatus,
        usageReason,
        promptIndex: promptIndexById.get(news.id) ?? null,
        relatedEvents: relatedEventsByNewsId.get(news.id) ?? [],
      };
    });

    const eligibleCount = [...eligibleByMonth.values()].reduce(
      (sum, monthItems) => sum + monthItems.length,
      0,
    );
    const usedCount = promptIndexById.size;

    return {
      savedCount: items.length,
      eligibleCount,
      usedCount,
      excludedCount: items.length - usedCount,
      items,
    };
  }

  private parseResponse(
    text: string,
    expectedMonths: string[],
  ): Record<string, TimelineEvent[]> {
    const json = this.extractJson(text);
    if (!json) {
      this.logger.warn('타임라인 JSON 파싱 실패');
      return {};
    }

    try {
      const raw = JSON.parse(json) as Record<
        string,
        Array<{
          category?: unknown;
          summary?: unknown;
          type?: unknown;
          importance?: unknown;
          sourceIndex?: unknown;
        }>
      >;

      const VALID_TYPES = new Set([
        'product',
        'contract',
        'partner',
        'invest',
        'hr',
        'risk',
        'other',
      ]);
      const VALID_IMP = new Set(['high', 'medium', 'low']);
      const expectedMonthSet = new Set(expectedMonths);
      const result: Record<string, TimelineEvent[]> = {};

      for (const ym of Object.keys(raw)) {
        if (!/^\d{4}-\d{2}$/.test(ym) || !expectedMonthSet.has(ym)) continue;
        const events = raw[ym];
        if (!Array.isArray(events)) continue;

        result[ym] = events
          .map((ev) => {
            const type = typeof ev.type === 'string' ? ev.type : '';
            const importance =
              typeof ev.importance === 'string' ? ev.importance : '';
            const rawSourceIndex =
              typeof ev.sourceIndex === 'number'
                ? ev.sourceIndex
                : typeof ev.sourceIndex === 'string' &&
                    /^\d+$/.test(ev.sourceIndex)
                  ? Number(ev.sourceIndex)
                  : null;

            return {
              category:
                typeof ev.category === 'string'
                  ? ev.category.trim().slice(0, 20)
                  : '기타',
              summary:
                typeof ev.summary === 'string'
                  ? ev.summary.trim().slice(0, 200)
                  : '',
              type: VALID_TYPES.has(type) ? type : 'other',
              importance: VALID_IMP.has(importance) ? importance : 'medium',
              sourceIndex:
                rawSourceIndex !== null &&
                Number.isInteger(rawSourceIndex) &&
                rawSourceIndex > 0
                  ? rawSourceIndex
                  : null,
            };
          })
          .filter((ev) => ev.category && ev.summary)
          .slice(0, 3);
      }

      return result;
    } catch (e) {
      this.logger.warn(`타임라인 JSON 파싱 오류: ${(e as Error).message}`);
      return {};
    }
  }

  private extractJson(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) return trimmed;

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();

    const match = trimmed.match(/\{[\s\S]*\}/);
    return match?.[0] ?? null;
  }

  private findRepresentativeNews(
    summary: string,
    candidates: CompanyNewsEntity[],
  ): CompanyNewsEntity | null {
    const summaryTokens = this.tokenize(summary);
    if (summaryTokens.size === 0) return null;

    let best: CompanyNewsEntity | null = null;
    let bestScore = 0;
    let bestMatches = 0;

    for (const candidate of candidates) {
      const titleTokens = this.tokenize(candidate.title);
      const matches = [...summaryTokens].filter((token) =>
        titleTokens.has(token),
      );
      const score =
        matches.length /
        Math.max(1, Math.min(summaryTokens.size, titleTokens.size));
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
        bestMatches = matches.length;
      }
    }

    return bestMatches >= 2 && bestScore >= 0.2 ? best : null;
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      value
        .toLowerCase()
        .replace(/[^0-9a-z가-힣]+/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    );
  }
}
