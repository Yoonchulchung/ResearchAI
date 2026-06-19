import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { CompanyFinancialAiAnalysisEntity } from 'src/company/domain/entity/company-financial-ai-analysis.entity';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import {
  DartFinancialService,
  YearlyFinancial,
  QuarterlyFinancial,
} from 'src/company/infrastructure/dart/dart-financial.service';
import { CompanyService } from './company.service';
import { CompanyStockService } from './company-stock.service';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';

export interface CompanyPeerMetric {
  key: string;
  label: string;
  unit: string;
  companyValue: number | null;
  peerAverage: number | null;
  peerCount: number;
}

export interface CompanyRiskSignal {
  key: string;
  label: string;
  description: string;
  severity: 'info' | 'warning' | 'danger';
  date: string | null;
}

export interface CompanyTimelineEvent {
  type: 'news' | 'disclosure' | 'financial' | 'risk';
  date: string;
  title: string;
  description?: string;
  url?: string;
  severity: 'info' | 'positive' | 'warning' | 'danger';
}

export interface CompanyFinancialInsights {
  industry: string | null;
  peerCount: number;
  peerCompanies: string[];
  peerMetrics: CompanyPeerMetric[];
  riskSignals: CompanyRiskSignal[];
  timelineEvents: CompanyTimelineEvent[];
}

export interface CompanyFinancialAiAnalysis {
  overview: string;
  strengths: string[];
  concerns: string[];
  trends: Array<{
    label: string;
    direction: 'improving' | 'worsening' | 'mixed' | 'stable';
    evidence: string;
  }>;
  checkpoints: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedFees: number;
  analyzedAt: string;
}

@Injectable()
export class CompanyFinancialInsightsService {
  private readonly quarterlyCache = new Map<
    string,
    {
      expiresAt: number;
      promise: Promise<QuarterlyFinancial[]>;
    }
  >();

  constructor(
    @InjectRepository(CompanyEntity)
    private readonly repo: Repository<CompanyEntity>,
    @InjectRepository(CompanyAnalysisEntity)
    private readonly analysisRepo: Repository<CompanyAnalysisEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
    @InjectRepository(CompanyFinancialAiAnalysisEntity)
    private readonly financialAiRepo: Repository<CompanyFinancialAiAnalysisEntity>,
    @InjectRepository(CompanyNewsEntity)
    private readonly newsRepo: Repository<CompanyNewsEntity>,
    private readonly dartFinancial: DartFinancialService,
    private readonly companyService: CompanyService,
    private readonly companyStock: CompanyStockService,
    private readonly aiProvider: AiProviderService,
  ) {}

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  async getFinancialInsights(
    idOrName: string,
  ): Promise<CompanyFinancialInsights> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [
        { id: idOrName },
        { normalizedName: normalized },
        { name: idOrName },
      ],
    });
    if (!company) throw new NotFoundException('기업을 찾을 수 없습니다.');

    const financial = await this.financialRepo.findOne({
      where: { companyId: company.id },
    });
    const yearly = this.parseFinancialRows(financial?.multiYearFinancials);
    const latest = yearly.at(-1) ?? null;
    const previous = yearly.at(-2) ?? null;
    const riskSignals = this.buildFinancialRiskSignals(latest, previous);
    const [peerMetrics, peerCompanies] = await this.buildPeerMetrics(
      company,
      financial,
      latest,
    );
    const newsRows = await this.newsRepo.find({
      where: { companyId: company.id },
      order: { publishedAt: 'DESC', fetchedAt: 'DESC' },
      take: 20,
    });

    return {
      industry: company.industry,
      peerCount: peerCompanies.length,
      peerCompanies,
      peerMetrics,
      riskSignals,
      timelineEvents: this.buildTimelineEvents(
        financial,
        yearly,
        riskSignals,
        newsRows,
      ),
    };
  }

  async refreshFinancials(
    companyId: string,
    dartApiKey: string,
  ): Promise<YearlyFinancial[]> {
    const company = await this.repo.findOne({ where: { id: companyId } });
    const corpCode = company?.corpCode ?? null;
    if (!corpCode)
      throw new Error('corpCode 없음 — 먼저 분석을 실행해 주세요.');

    const { financials } = await this.dartFinancial.fetchMultiYearFinancials(
      corpCode,
      dartApiKey,
    );
    if (financials.length) {
      await this.companyService.upsertFinancial(companyId, {
        multiYearFinancials: JSON.stringify(financials),
      });
    }
    this.quarterlyCache.delete(companyId);
    return financials;
  }

  async analyzeFinancialStatements(
    idOrName: string,
    model: string,
  ): Promise<CompanyFinancialAiAnalysis> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [
        { id: idOrName },
        { normalizedName: normalized },
        { name: idOrName },
      ],
    });
    if (!company) throw new NotFoundException('기업을 찾을 수 없습니다.');

    const financial = await this.financialRepo.findOne({
      where: { companyId: company.id },
    });
    const yearly = this.parseFinancialRows(financial?.multiYearFinancials);
    if (!yearly.length) {
      throw new Error('분석할 연간 재무 데이터가 없습니다.');
    }
    const marketMetrics = await this.companyStock.getMarketMetricsByStockCode(
      financial?.stockCode,
    );
    const financialRows = yearly.map((row) => ({
      year: row.year,
      // 손익계산서
      revenue: row.revenue,
      grossProfit: row.grossProfit,
      grossMargin: row.grossMargin,
      operatingProfit: row.operatingProfit,
      netIncome: row.netIncome,
      operatingMargin: row.operatingMargin,
      netIncomeMargin: row.netIncomeMargin,
      interestExpense: row.interestExpense,
      interestCoverageRatio: row.interestCoverageRatio,
      // 재무상태표
      totalAssets: row.totalAssets,
      nonCurrentAssets: row.nonCurrentAssets,
      tangibleAssets: row.tangibleAssets,
      intangibleAssets: row.intangibleAssets,
      totalLiabilities: row.totalLiabilities,
      nonCurrentLiabilities: row.nonCurrentLiabilities,
      totalEquity: row.totalEquity,
      capitalAmount: row.capitalAmount,
      currentAssets: row.currentAssets,
      cashAndEquivalents: row.cashAndEquivalents,
      inventories: row.inventories,
      accountsReceivable: row.accountsReceivable,
      currentLiabilities: row.currentLiabilities,
      shortTermBorrowings: row.shortTermBorrowings,
      longTermBorrowings: row.longTermBorrowings,
      bonds: row.bonds,
      totalBorrowings: row.totalBorrowings,
      netDebt: row.netDebt,
      workingCapital: row.workingCapital,
      // 비율
      debtRatio: row.debtRatio,
      currentRatio: row.currentRatio,
      netDebtRatio: row.netDebtRatio,
      roe: row.roe,
      roa: row.roa,
      // 현금흐름
      operatingCashFlow: row.operatingCashFlow,
      investingCashFlow: row.investingCashFlow,
      financingCashFlow: row.financingCashFlow,
    }));
    const latest = yearly.at(-1)!;
    const fixedFacts = {
      latestYear: latest.year,
      profitability:
        latest.operatingProfit == null
          ? '판단 불가'
          : latest.operatingProfit < 0
            ? '영업적자'
            : '영업흑자',
      grossProfitability:
        latest.grossProfit == null
          ? '판단 불가'
          : latest.grossProfit < 0
            ? '매출총손실'
            : '매출총이익 흑자',
      debtRatioInterpretation:
        latest.debtRatio == null
          ? '판단 불가'
          : latest.debtRatio >= 200
            ? '높음'
            : latest.debtRatio >= 100
              ? '보통'
              : '낮음',
      currentRatioInterpretation:
        latest.currentRatio == null
          ? '판단 불가'
          : latest.currentRatio < 100
            ? '100% 미만으로 단기 지급능력 주의'
            : '100% 이상',
      netDebtStatus:
        latest.netDebt == null
          ? '판단 불가'
          : latest.netDebt < 0
            ? '순현금 보유(차입금보다 현금이 많음)'
            : '순차입 상태',
      interestCoverageStatus:
        latest.interestCoverageRatio == null
          ? '판단 불가'
          : latest.interestCoverageRatio < 1
            ? '이자보상배율 1배 미만 — 영업이익으로 이자도 못 내는 상태'
            : latest.interestCoverageRatio < 3
              ? `이자보상배율 ${latest.interestCoverageRatio}배 — 안전 마진 낮음`
              : `이자보상배율 ${latest.interestCoverageRatio}배 — 양호`,
      operatingCashFlowStatus:
        latest.operatingCashFlow == null
          ? '판단 불가'
          : latest.operatingCashFlow < 0
            ? '영업활동 현금 순유출'
            : '영업활동 현금 순유입',
    };
    const system = [
      '너는 기업 재무제표를 비전문가도 이해할 수 있게 해석하는 재무 분석가다.',
      '제공된 숫자만 근거로 사용하고, 누락된 값은 추정하지 마라.',
      '투자 매수·매도 추천이나 미래 주가 예측을 하지 마라.',
      '단위는 억원이며 비율은 퍼센트다.',
      '부채비율은 낮을수록 일반적으로 안정적이다. 100% 미만을 높다고 표현하지 마라.',
      '유동비율은 100% 이상이면 유동자산이 유동부채보다 많다는 뜻이다. 매우 큰 값은 유동부채 분모가 작은 영향도 설명하라.',
      '영업이익 또는 순이익이 음수면 흑자나 수익성이 좋다고 표현하지 마라.',
      '순차입금이 음수이면 순현금 보유 상태(현금이 차입금보다 많음)를 의미한다.',
      '이자보상배율이 1배 미만이면 영업이익으로 이자도 감당 못하는 상태다.',
      '아래 고정 판정은 숫자로 계산된 사실이므로 절대 반대로 해석하지 마라.',
      '모든 문장은 자연스러운 한국어로만 작성하고 한자나 중국어 표현을 섞지 마라.',
      '반드시 JSON만 반환하라.',
    ].join('\n');
    const prompt = [
      `기업명: ${company.name}`,
      `업종: ${company.industry ?? '정보 없음'}`,
      `연간 재무 데이터: ${JSON.stringify(financialRows)}`,
      `시장 지표: ${JSON.stringify({
        per: marketMetrics?.per ?? null,
        pbr: marketMetrics?.pbr ?? null,
        eps: marketMetrics?.eps ?? null,
        bps: marketMetrics?.bps ?? null,
        dividendYield: marketMetrics?.dividendYield ?? null,
      })}`,
      `고정 판정: ${JSON.stringify(fixedFacts)}`,
      '',
      '최근 연도 중심으로 수익성, 성장성, 재무안정성, 현금흐름을 해석하라.',
      '큰 비율은 분모가 작아 왜곡될 수 있음을 숫자와 함께 설명하라.',
      '반환 형식:',
      JSON.stringify({
        overview: '핵심 해석 2~4문장',
        strengths: ['근거가 포함된 강점'],
        concerns: ['근거가 포함된 주의점'],
        trends: [
          {
            label: '매출 또는 수익성 등',
            direction: 'improving|worsening|mixed|stable',
            evidence: '연도와 수치를 포함한 근거',
          },
        ],
        checkpoints: ['다음 공시에서 확인할 항목'],
      }),
    ].join('\n');

    const result = await this.aiProvider.call(model, system, prompt, {
      caller: 'CompanyFinancialInsights/analyzeFinancialStatements',
    });
    const parsed = this.parseFinancialAiResponse(result.text, yearly);
    const effectiveModel = this.aiProvider.resolveEffectiveModel(model);
    const analyzedAt = new Date().toISOString();
    const analysis: CompanyFinancialAiAnalysis = {
      ...parsed,
      model: effectiveModel,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedFees: result.estimatedFees,
      analyzedAt,
    };

    await this.financialAiRepo.save(
      this.financialAiRepo.create({
        id: randomUUID(),
        companyId: company.id,
        model: effectiveModel,
        result: JSON.stringify(analysis),
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        estimatedFees: result.estimatedFees ?? null,
        analyzedAt,
      }),
    );

    return analysis;
  }

  async getAiAnalysisHistory(
    companyId: string,
    limit = 10,
  ): Promise<Array<CompanyFinancialAiAnalysis & { id: string; createdAt: string }>> {
    const rows = await this.financialAiRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      ...(JSON.parse(row.result) as CompanyFinancialAiAnalysis),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getQuarterlyFinancials(
    companyId: string,
    dartApiKey: string,
  ): Promise<QuarterlyFinancial[]> {
    const cached = this.quarterlyCache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const company = await this.repo.findOne({ where: { id: companyId } });
    const corpCode = company?.corpCode ?? null;
    if (!corpCode)
      throw new Error('corpCode 없음 — 먼저 분석을 실행해 주세요.');

    const promise = this.dartFinancial
      .fetchRecentQuarterlyFinancials(corpCode, dartApiKey)
      .catch((error) => {
        this.quarterlyCache.delete(companyId);
        throw error;
      });
    this.quarterlyCache.set(companyId, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      promise,
    });
    return promise;
  }

  private parseFinancialRows(
    raw: string | null | undefined,
  ): YearlyFinancial[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as YearlyFinancial[];
      return Array.isArray(parsed)
        ? parsed
            .filter((item) => typeof item.year === 'number')
            .sort((a, b) => a.year - b.year)
        : [];
    } catch {
      return [];
    }
  }

  private parseDisclosures(
    raw: string | null | undefined,
  ): { title: string; date: string; url: string }[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as {
        title?: unknown;
        date?: unknown;
        url?: unknown;
      }[];
      return Array.isArray(parsed)
        ? parsed
            .map((item) => ({
              title: this.asText(item.title),
              date: this.asText(item.date),
              url: this.asText(item.url),
            }))
            .filter((item) => item.title && item.date)
        : [];
    } catch {
      return [];
    }
  }

  private async buildPeerMetrics(
    company: CompanyEntity,
    financial: CompanyFinancialEntity | null,
    latest: YearlyFinancial | null,
  ): Promise<[CompanyPeerMetric[], string[]]> {
    const metrics: Array<{
      key: keyof YearlyFinancial;
      label: string;
      unit: string;
    }> = [
      { key: 'per', label: 'PER', unit: '배' },
      { key: 'pbr', label: 'PBR', unit: '배' },
      { key: 'psr', label: 'PSR', unit: '배' },
      { key: 'roe', label: 'ROE', unit: '%' },
      { key: 'operatingMargin', label: '영업이익률', unit: '%' },
      { key: 'debtRatio', label: '부채비율', unit: '%' },
      { key: 'currentRatio', label: '유동비율', unit: '%' },
    ];

    const companyMarketMetrics =
      await this.companyStock.getMarketMetricsByStockCode(financial?.stockCode);
    const companyMetricValue = (key: keyof YearlyFinancial): number | null => {
      if (key === 'per' || key === 'pbr') {
        const value =
          this.asNumber(companyMarketMetrics?.[key]) ??
          this.asNumber(latest?.[key]);
        return value != null && value > 0 ? value : null;
      }
      return this.financialMetricValue(latest, key);
    };
    const empty = (peerCount = 0) =>
      metrics.map((metric) => ({
        key: String(metric.key),
        label: metric.label,
        unit: metric.unit,
        companyValue: companyMetricValue(metric.key),
        peerAverage: null,
        peerCount,
      }));

    const analysis = await this.analysisRepo.findOne({
      where: { companyId: company.id },
    });
    const competitorNames = new Set(
      this.parseCompetitorNames(analysis?.competitors),
    );
    const financialRows = await this.financialRepo.find({
      relations: { company: true },
    });
    const peerRows = financialRows
      .filter(
        (row) =>
          row.companyId !== company.id &&
          row.company &&
          this.parseFinancialRows(row.multiYearFinancials).length > 0,
      )
      .map((row) => {
        const peer = row.company!;
        const exactIndustry =
          Boolean(company.industry?.trim()) &&
          peer.industry?.trim() === company.industry?.trim();
        const directCompetitor =
          competitorNames.has(peer.name) ||
          competitorNames.has(peer.normalizedName);
        const industrySimilarity = this.industrySimilarity(
          company.industry,
          peer.industry,
        );
        return {
          row,
          peer,
          latest: this.parseFinancialRows(row.multiYearFinancials).at(-1)!,
          score:
            (directCompetitor ? 100 : 0) +
            (exactIndustry ? 50 : 0) +
            industrySimilarity,
        };
      })
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    if (!peerRows.length) return [empty(), []];

    const peerMarketMetrics = await Promise.all(
      peerRows.map((item) =>
        this.companyStock.getMarketMetricsByStockCode(item.row.stockCode),
      ),
    );

    return [
      metrics.map((metric) => {
        const values = peerRows
          .map((item, index) => {
            if (metric.key === 'per' || metric.key === 'pbr') {
              const value =
                this.asNumber(peerMarketMetrics[index]?.[metric.key]) ??
                this.asNumber(item.latest[metric.key]);
              return value != null && value > 0 ? value : null;
            }
            return this.financialMetricValue(item.latest, metric.key);
          })
          .filter((value): value is number => value != null);
        return {
          key: String(metric.key),
          label: metric.label,
          unit: metric.unit,
          companyValue: companyMetricValue(metric.key),
          peerAverage: values.length ? this.round2(this.avg(values)) : null,
          peerCount: values.length,
        };
      }),
      peerRows.map((item) => item.peer.name),
    ];
  }

  private parseCompetitorNames(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Array<{ name?: unknown }>;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item) => {
        const name = this.asText(item.name);
        return name ? [name, this.normalizeName(name)] : [];
      });
    } catch {
      return [];
    }
  }

  private industrySimilarity(
    left: string | null | undefined,
    right: string | null | undefined,
  ): number {
    const tokens = (value: string | null | undefined) =>
      new Set(
        String(value ?? '')
          .toLowerCase()
          .split(/[^0-9a-z가-힣]+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 2),
      );
    const leftTokens = tokens(left);
    const rightTokens = tokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    const overlap = [...leftTokens].filter((token) =>
      [...rightTokens].some(
        (candidate) => candidate.includes(token) || token.includes(candidate),
      ),
    ).length;
    return overlap / Math.max(leftTokens.size, rightTokens.size);
  }

  private asText(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  }

  private financialMetricValue(
    row: YearlyFinancial | null,
    key: keyof YearlyFinancial,
  ): number | null {
    const stored = this.asNumber(row?.[key]);
    if (stored != null) return stored;
    if (key === 'roe') {
      const netIncome = this.asNumber(row?.netIncome);
      const totalEquity = this.asNumber(row?.totalEquity);
      if (netIncome != null && totalEquity) {
        return this.round2((netIncome / totalEquity) * 100);
      }
    }
    return null;
  }

  private parseFinancialAiResponse(
    text: string,
    yearly: YearlyFinancial[],
  ): Pick<
    CompanyFinancialAiAnalysis,
    'overview' | 'strengths' | 'concerns' | 'trends' | 'checkpoints'
  > {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('AI 재무 분석 결과를 해석하지 못했습니다.');
    }
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      overview?: unknown;
      strengths?: unknown;
      concerns?: unknown;
      trends?: unknown;
      checkpoints?: unknown;
    };
    const clean = (value: unknown) =>
      this.sanitizeFinancialAiText(this.asText(value));
    const strings = (value: unknown) =>
      Array.isArray(value)
        ? value
            .map((item) => clean(item))
            .filter(Boolean)
            .slice(0, 6)
        : [];
    const allowedDirections = new Set([
      'improving',
      'worsening',
      'mixed',
      'stable',
    ]);
    const trends = Array.isArray(parsed.trends)
      ? parsed.trends
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const label = clean(row.label);
            const evidence = clean(row.evidence);
            const direction = this.asText(row.direction);
            if (!label || !evidence || !allowedDirections.has(direction)) {
              return null;
            }
            return {
              label,
              evidence,
              direction: direction as
                | 'improving'
                | 'worsening'
                | 'mixed'
                | 'stable',
            };
          })
          .filter(
            (
              item,
            ): item is {
              label: string;
              evidence: string;
              direction: 'improving' | 'worsening' | 'mixed' | 'stable';
            } => item != null,
          )
          .slice(0, 6)
      : [];
    const first = yearly.at(0) ?? null;
    const latest = yearly.at(-1) ?? null;
    let overview = clean(parsed.overview) || '분석 결과가 비어 있습니다.';
    if (latest?.currentRatio != null && latest.currentRatio >= 100) {
      overview = overview.replace(
        /유동비율이 낮(?:은 편|다|음)?/g,
        '유동비율이 높은 편',
      );
    }
    if (
      first?.operatingProfit != null &&
      latest?.operatingProfit != null &&
      latest.operatingProfit > first.operatingProfit &&
      latest.operatingProfit < 0
    ) {
      overview = overview.replace(
        /수익성 개선은 확인되지 않는다/g,
        '영업적자는 지속되지만 손실 폭은 축소됐다',
      );
    }
    const groundedTrends = trends.map((trend) => ({
      ...trend,
      direction: this.groundTrendDirection(
        trend.label,
        first,
        latest,
        trend.direction,
      ),
    }));
    return {
      overview,
      strengths: strings(parsed.strengths),
      concerns: strings(parsed.concerns),
      trends: groundedTrends,
      checkpoints: strings(parsed.checkpoints),
    };
  }

  private groundTrendDirection(
    label: string,
    first: YearlyFinancial | null,
    latest: YearlyFinancial | null,
    fallback: 'improving' | 'worsening' | 'mixed' | 'stable',
  ): 'improving' | 'worsening' | 'mixed' | 'stable' {
    const direction = (
      start: number | null | undefined,
      end: number | null | undefined,
      lowerIsBetter = false,
    ) => {
      if (start == null || end == null) return fallback;
      if (start === end) return 'stable' as const;
      const improved = lowerIsBetter ? end < start : end > start;
      return improved ? ('improving' as const) : ('worsening' as const);
    };
    if (label.includes('매출')) {
      return direction(first?.revenue, latest?.revenue);
    }
    if (label.includes('영업이익률')) {
      return direction(first?.operatingMargin, latest?.operatingMargin);
    }
    if (label.includes('영업이익') || label.includes('수익성')) {
      return direction(first?.operatingProfit, latest?.operatingProfit);
    }
    if (label.includes('순이익')) {
      return direction(first?.netIncome, latest?.netIncome);
    }
    if (label.includes('부채')) {
      return direction(first?.debtRatio, latest?.debtRatio, true);
    }
    return fallback;
  }

  private sanitizeFinancialAiText(value: string): string {
    return value
      .replace(/最近/g, '최근')
      .replace(/变化/g, '변화')
      .replace(/纯익/g, '순이익')
      .replace(/年/g, '년')
      .replace(/[の]/g, '')
      .replace(/[\u3040-\u30ff]/g, '')
      .replace(/\bsuch\b/gi, '해당')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private buildFinancialRiskSignals(
    latest: YearlyFinancial | null,
    previous: YearlyFinancial | null,
  ): CompanyRiskSignal[] {
    if (!latest) return [];
    const date = `${latest.year}-12-31`;
    const signals: CompanyRiskSignal[] = [];
    const yoyRevenue = this.changePct(latest.revenue, previous?.revenue);
    const marginChange =
      latest.operatingMargin != null && previous?.operatingMargin != null
        ? this.round2(latest.operatingMargin - previous.operatingMargin)
        : null;

    if (
      latest.netIncome != null &&
      latest.netIncome < 0 &&
      previous?.netIncome != null &&
      previous.netIncome >= 0
    ) {
      signals.push({
        key: 'net-loss-turnaround',
        label: '순손실 전환',
        description: `${latest.year}년 당기순이익이 적자로 전환되었습니다.`,
        severity: 'danger',
        date,
      });
    } else if (latest.netIncome != null && latest.netIncome < 0) {
      signals.push({
        key: 'net-loss',
        label: '순손실',
        description: `${latest.year}년 당기순이익이 적자입니다.`,
        severity: 'danger',
        date,
      });
    }

    if (latest.operatingProfit != null && latest.operatingProfit < 0) {
      signals.push({
        key: 'operating-loss',
        label: '영업손실',
        description: `${latest.year}년 영업이익이 적자입니다.`,
        severity: 'danger',
        date,
      });
    }

    if (yoyRevenue != null && yoyRevenue <= -10) {
      signals.push({
        key: 'revenue-drop',
        label: '매출 감소',
        description: `매출이 전년 대비 ${Math.abs(yoyRevenue).toFixed(1)}% 감소했습니다.`,
        severity: 'warning',
        date,
      });
    }

    if (marginChange != null && marginChange <= -5) {
      signals.push({
        key: 'margin-drop',
        label: '수익성 하락',
        description: `영업이익률이 전년 대비 ${Math.abs(marginChange).toFixed(1)}%p 하락했습니다.`,
        severity: 'warning',
        date,
      });
    }

    if (latest.debtRatio != null && latest.debtRatio >= 200) {
      signals.push({
        key: 'high-debt-ratio',
        label: '부채비율 높음',
        description: `부채비율이 ${latest.debtRatio.toFixed(1)}%입니다.`,
        severity: latest.debtRatio >= 300 ? 'danger' : 'warning',
        date,
      });
    }

    if (latest.currentRatio != null && latest.currentRatio < 100) {
      signals.push({
        key: 'low-current-ratio',
        label: '유동비율 낮음',
        description: `유동비율이 ${latest.currentRatio.toFixed(1)}%로 100% 미만입니다.`,
        severity: 'warning',
        date,
      });
    }

    if (latest.operatingCashFlow != null && latest.operatingCashFlow < 0) {
      signals.push({
        key: 'negative-operating-cashflow',
        label: '영업현금흐름 적자',
        description: `${latest.year}년 영업활동현금흐름이 음수입니다.`,
        severity: 'warning',
        date,
      });
    }

    return signals.slice(0, 8);
  }

  private buildTimelineEvents(
    financial: CompanyFinancialEntity | null,
    yearly: YearlyFinancial[],
    riskSignals: CompanyRiskSignal[],
    newsRows: CompanyNewsEntity[],
  ): CompanyTimelineEvent[] {
    const events: CompanyTimelineEvent[] = [];

    for (const item of yearly.slice(-5)) {
      events.push({
        type: 'financial',
        date: `${item.year}-12-31`,
        title: `${item.year}년 실적`,
        description: [
          item.revenue != null
            ? `매출 ${item.revenue.toLocaleString('ko-KR')}억`
            : '',
          item.operatingProfit != null
            ? `영업이익 ${item.operatingProfit.toLocaleString('ko-KR')}억`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        severity:
          item.operatingProfit != null && item.operatingProfit < 0
            ? 'warning'
            : 'positive',
      });
    }

    for (const item of this.parseDisclosures(financial?.disclosures).slice(
      0,
      12,
    )) {
      const date = this.normalizeDateString(item.date);
      if (!date) continue;
      events.push({
        type: 'disclosure',
        date,
        title: item.title,
        url: item.url,
        severity: 'info',
      });
    }

    for (const signal of riskSignals) {
      if (!signal.date) continue;
      events.push({
        type: 'risk',
        date: signal.date,
        title: signal.label,
        description: signal.description,
        severity: signal.severity,
      });
    }

    for (const item of newsRows) {
      const date =
        this.normalizeDateString(item.publishedAt) ??
        item.fetchedAt.toISOString().slice(0, 10);
      events.push({
        type: 'news',
        date,
        title: item.title,
        description: item.snippet ?? undefined,
        url: item.url,
        severity: 'info',
      });
    }

    return events
      .filter((event) => event.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private avg(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private changePct(
    current: number | null | undefined,
    previous: number | null | undefined,
  ): number | null {
    if (current == null || previous == null || previous === 0) return null;
    return this.round2(((current - previous) / Math.abs(previous)) * 100);
  }

  private normalizeDateString(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const dotted = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (dotted) {
      return `${dotted[1]}-${dotted[2].padStart(2, '0')}-${dotted[3].padStart(2, '0')}`;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed).toISOString().slice(0, 10);
  }
}
