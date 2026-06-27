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
} from 'src/financial/infrastructure/dart/dart-financial.service';
import {
  FinancialInsightsService,
  CompanyFinancialInsights,
  CompanyFinancialAiAnalysis,
  CompanyPeerMetric,
  PEER_METRIC_DEFS,
} from 'src/financial/application/financial-insights.service';
import { CompanyService } from 'src/company/application/company.service';
import { StockQuoteService } from 'src/financial/application/stock/stock-quote.service';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';

export type {
  CompanyPeerMetric,
  CompanyRiskSignal,
  CompanyTimelineEvent,
  CompanyFinancialInsights,
  CompanyFinancialAiAnalysis,
} from 'src/financial/application/financial-insights.service';

@Injectable()
export class CompanyFinancialInsightsImplService {
  private readonly quarterlyCache = new Map<
    string,
    { expiresAt: number; promise: Promise<QuarterlyFinancial[]> }
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
    private readonly companyStock: StockQuoteService,
    private readonly aiProvider: AiProviderService,
    private readonly insights: FinancialInsightsService,
  ) {}

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  private async resolveCompany(idOrName: string): Promise<CompanyEntity> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [
        { id: idOrName },
        { normalizedName: normalized },
        { name: idOrName },
      ],
    });
    if (!company) throw new NotFoundException('기업을 찾을 수 없습니다.');
    return company;
  }

  async getFinancialInsights(
    idOrName: string,
  ): Promise<CompanyFinancialInsights> {
    const company = await this.resolveCompany(idOrName);
    const financial = await this.financialRepo.findOne({
      where: { companyId: company.id },
    });
    const yearly = this.insights.parseFinancialRows(
      financial?.multiYearFinancials,
    );
    const latest = yearly.at(-1) ?? null;
    const previous = yearly.at(-2) ?? null;
    const riskSignals = this.insights.buildFinancialRiskSignals(
      latest,
      previous,
    );
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
      timelineEvents: this.insights.buildTimelineEvents(
        financial ?? null,
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
    const company = await this.resolveCompany(idOrName);
    const financial = await this.financialRepo.findOne({
      where: { companyId: company.id },
    });
    const yearly = this.insights.parseFinancialRows(
      financial?.multiYearFinancials,
    );
    if (!yearly.length) throw new Error('분석할 연간 재무 데이터가 없습니다.');

    const marketMetrics = await this.companyStock.getMarketMetricsByStockCode(
      financial?.stockCode,
    );
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
      `연간 재무 데이터: ${JSON.stringify(yearly)}`,
      `시장 지표: ${JSON.stringify({ per: marketMetrics?.per ?? null, pbr: marketMetrics?.pbr ?? null, eps: marketMetrics?.eps ?? null, bps: marketMetrics?.bps ?? null, dividendYield: marketMetrics?.dividendYield ?? null })}`,
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
    const parsed = this.insights.parseFinancialAiResponse(result.text, yearly);
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
  ): Promise<
    Array<CompanyFinancialAiAnalysis & { id: string; createdAt: string }>
  > {
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

  private async buildPeerMetrics(
    company: CompanyEntity,
    financial: CompanyFinancialEntity | null,
    latest: YearlyFinancial | null,
  ): Promise<[CompanyPeerMetric[], string[]]> {
    const companyMarketMetrics =
      await this.companyStock.getMarketMetricsByStockCode(financial?.stockCode);
    const companyMetricValue = (key: keyof YearlyFinancial): number | null => {
      if (key === 'per' || key === 'pbr') {
        const value =
          this.insights.asNumber(companyMarketMetrics?.[key]) ??
          this.insights.asNumber(latest?.[key]);
        return value != null && value > 0 ? value : null;
      }
      return this.insights.financialMetricValue(latest, key);
    };
    const empty = (peerCount = 0) =>
      PEER_METRIC_DEFS.map((m) => ({
        key: String(m.key),
        label: m.label,
        unit: m.unit,
        companyValue: companyMetricValue(m.key),
        peerAverage: null,
        peerCount,
      }));

    const analysis = await this.analysisRepo.findOne({
      where: { companyId: company.id },
    });
    const competitorNames = new Set(
      this.insights.parseCompetitorNames(analysis?.competitors),
    );
    const financialRows = await this.financialRepo.find({
      relations: { company: true },
    });

    const peerRows = financialRows
      .filter(
        (row) =>
          row.companyId !== company.id &&
          row.company &&
          this.insights.parseFinancialRows(row.multiYearFinancials).length > 0,
      )
      .map((row) => {
        const peer = row.company!;
        const exactIndustry =
          Boolean(company.industry?.trim()) &&
          peer.industry?.trim() === company.industry?.trim();
        const directCompetitor =
          competitorNames.has(peer.name) ||
          competitorNames.has(peer.normalizedName);
        const industrySimilarity = this.insights.industrySimilarity(
          company.industry,
          peer.industry,
        );
        return {
          row,
          peer,
          latest: this.insights
            .parseFinancialRows(row.multiYearFinancials)
            .at(-1)!,
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
      PEER_METRIC_DEFS.map((metric) => {
        const values = peerRows
          .map((item, index) => {
            if (metric.key === 'per' || metric.key === 'pbr') {
              const value =
                this.insights.asNumber(
                  peerMarketMetrics[index]?.[metric.key],
                ) ?? this.insights.asNumber(item.latest[metric.key]);
              return value != null && value > 0 ? value : null;
            }
            return this.insights.financialMetricValue(item.latest, metric.key);
          })
          .filter((v): v is number => v != null);

        return {
          key: String(metric.key),
          label: metric.label,
          unit: metric.unit,
          companyValue: companyMetricValue(metric.key),
          peerAverage: values.length
            ? this.insights.round2(this.insights.avg(values))
            : null,
          peerCount: values.length,
        };
      }),
      peerRows.map((item) => item.peer.name),
    ];
  }
}
