import { Injectable } from '@nestjs/common';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { YearlyFinancial } from 'src/financial/infrastructure/dart/dart-financial.service';

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

export const PEER_METRIC_DEFS: Array<{
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

@Injectable()
export class FinancialInsightsImplService {
  parseFinancialRows(raw: string | null | undefined): YearlyFinancial[] {
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

  parseDisclosures(
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

  parseCompetitorNames(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Array<{ name?: unknown }>;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item) => {
        const name = this.asText(item.name);
        return name ? [name, this.normalizeForMatch(name)] : [];
      });
    } catch {
      return [];
    }
  }

  buildFinancialRiskSignals(
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

  buildTimelineEvents(
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
      .filter((e) => e.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  parseFinancialAiResponse(
    text: string,
    yearly: YearlyFinancial[],
  ): Pick<
    CompanyFinancialAiAnalysis,
    'overview' | 'strengths' | 'concerns' | 'trends' | 'checkpoints'
  > {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start)
      throw new Error('AI 재무 분석 결과를 해석하지 못했습니다.');

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
            if (!label || !evidence || !allowedDirections.has(direction))
              return null;
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
          .filter((item): item is NonNullable<typeof item> => item != null)
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

    return {
      overview,
      strengths: strings(parsed.strengths),
      concerns: strings(parsed.concerns),
      trends: trends.map((trend) => ({
        ...trend,
        direction: this.groundTrendDirection(
          trend.label,
          first,
          latest,
          trend.direction,
        ),
      })),
      checkpoints: strings(parsed.checkpoints),
    };
  }

  financialMetricValue(
    row: YearlyFinancial | null,
    key: keyof YearlyFinancial,
  ): number | null {
    const stored = this.asNumber(row?.[key]);
    if (stored != null) return stored;
    if (key === 'roe') {
      const netIncome = this.asNumber(row?.netIncome);
      const totalEquity = this.asNumber(row?.totalEquity);
      if (netIncome != null && totalEquity)
        return this.round2((netIncome / totalEquity) * 100);
    }
    return null;
  }

  industrySimilarity(
    left: string | null | undefined,
    right: string | null | undefined,
  ): number {
    const tokens = (value: string | null | undefined) =>
      new Set(
        String(value ?? '')
          .toLowerCase()
          .split(/[^0-9a-z가-힣]+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2),
      );
    const leftTokens = tokens(left);
    const rightTokens = tokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    const overlap = [...leftTokens].filter((t) =>
      [...rightTokens].some((c) => c.includes(t) || t.includes(c)),
    ).length;
    return overlap / Math.max(leftTokens.size, rightTokens.size);
  }

  asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  asText(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  }

  avg(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  changePct(
    current: number | null | undefined,
    previous: number | null | undefined,
  ): number | null {
    if (current == null || previous == null || previous === 0) return null;
    return this.round2(((current - previous) / Math.abs(previous)) * 100);
  }

  normalizeDateString(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const dotted = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (dotted)
      return `${dotted[1]}-${dotted[2].padStart(2, '0')}-${dotted[3].padStart(2, '0')}`;
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed)
      ? null
      : new Date(parsed).toISOString().slice(0, 10);
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
      return (lowerIsBetter ? end < start : end > start)
        ? ('improving' as const)
        : ('worsening' as const);
    };
    if (label.includes('매출'))
      return direction(first?.revenue, latest?.revenue);
    if (label.includes('영업이익률'))
      return direction(first?.operatingMargin, latest?.operatingMargin);
    if (label.includes('영업이익') || label.includes('수익성'))
      return direction(first?.operatingProfit, latest?.operatingProfit);
    if (label.includes('순이익'))
      return direction(first?.netIncome, latest?.netIncome);
    if (label.includes('부채'))
      return direction(first?.debtRatio, latest?.debtRatio, true);
    return fallback;
  }

  private sanitizeFinancialAiText(value: string): string {
    return value
      .replace(/最近/g, '최근')
      .replace(/变化/g, '변화')
      .replace(/纯익/g, '순이익')
      .replace(/年/g, '년')
      .replace(/[の]/g, '')
      .replace(/[぀-ヿ]/g, '')
      .replace(/\bsuch\b/gi, '해당')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private normalizeForMatch(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }
}
