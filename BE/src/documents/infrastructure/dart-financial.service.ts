import { Injectable, Logger } from '@nestjs/common';

const OPEN_DART_BASE = 'https://opendart.fss.or.kr/api';

// reprt_code: 11011=사업보고서, 11012=반기보고서, 11013=1분기, 11014=3분기
const ANNUAL_REPORT_CODE = '11011';

export interface DartFinancialData {
  companyName: string;
  corpCode: string | null;
  stockCode: string | null;
  industry: string | null;
  ceoName: string | null;
  foundedDate: string | null;
  employees: string | null;
  revenue: string | null;
  operatingProfit: string | null;
  netIncome: string | null;
  totalAssets: string | null;
  totalEquity: string | null;
  fiscalYear: string | null;
  disclosures: { title: string; date: string; url: string }[];
}

interface OpenDartListItem {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  modify_date: string;
}

interface OpenDartCompany {
  corp_name: string;
  stock_code: string;
  ceo_nm: string;
  est_dt: string;
  induty_code: string;
  enpbsnTermCnt: string; // 직원 수
}

interface OpenDartFinanceItem {
  account_nm: string;
  thstrm_amount: string; // 당기 금액
  frmtrm_amount: string; // 전기 금액
  bsns_year: string;
}

interface OpenDartDisclosure {
  report_nm: string;
  rcept_dt: string;
  rcept_no: string;
}

@Injectable()
export class DartFinancialService {
  private readonly logger = new Logger(DartFinancialService.name);

  async fetchCompanyData(
    companyName: string,
    dartApiKey?: string | null,
  ): Promise<DartFinancialData | null> {
    if (!dartApiKey) {
      this.logger.log('[DART] API 키 없음 — 수집 건너뜀');
      return null;
    }

    try {
      // 1. 기업 고유번호(corp_code) 조회
      const corpCode = await this.findCorpCode(companyName, dartApiKey);
      if (!corpCode) {
        this.logger.warn(`[DART] "${companyName}" 기업 코드 조회 실패`);
        return null;
      }

      // 2. 기업 개황 + 최근 공시 + 재무제표 병렬 조회
      const [company, disclosures, finance] = await Promise.allSettled([
        this.fetchCompanyInfo(corpCode, dartApiKey),
        this.fetchDisclosures(corpCode, dartApiKey),
        this.fetchFinancials(corpCode, dartApiKey),
      ]);

      const companyInfo = company.status === 'fulfilled' ? company.value : null;
      const disclosureList = disclosures.status === 'fulfilled' ? disclosures.value : [];
      const financeData = finance.status === 'fulfilled' ? finance.value : null;

      return {
        companyName,
        corpCode,
        stockCode: companyInfo?.stock_code ?? null,
        industry: companyInfo?.induty_code ?? null,
        ceoName: companyInfo?.ceo_nm ?? null,
        foundedDate: companyInfo?.est_dt ?? null,
        employees: companyInfo?.enpbsnTermCnt ?? null,
        revenue: financeData?.revenue ?? null,
        operatingProfit: financeData?.operatingProfit ?? null,
        netIncome: financeData?.netIncome ?? null,
        totalAssets: financeData?.totalAssets ?? null,
        totalEquity: financeData?.totalEquity ?? null,
        fiscalYear: financeData?.fiscalYear ?? null,
        disclosures: disclosureList,
      };
    } catch (err) {
      this.logger.error(`[DART] 데이터 수집 오류: ${(err as Error).message}`);
      return null;
    }
  }

  /** 기업명으로 corp_code 검색 */
  private async findCorpCode(companyName: string, apiKey: string): Promise<string | null> {
    const url = `${OPEN_DART_BASE}/list.json?crtfc_key=${apiKey}&corp_name=${encodeURIComponent(companyName)}&page_no=1&page_count=5`;
    const res = await this.dartFetch<{ status: string; list?: OpenDartListItem[] }>(url);
    if (!res || res.status !== '000' || !res.list?.length) return null;

    // 이름이 정확히 일치하는 것 우선, 없으면 첫 번째 결과
    const exact = res.list.find((c) => c.corp_name === companyName);
    return (exact ?? res.list[0]).corp_code;
  }

  /** 기업 개황 조회 */
  private async fetchCompanyInfo(corpCode: string, apiKey: string): Promise<OpenDartCompany | null> {
    const url = `${OPEN_DART_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
    const res = await this.dartFetch<{ status: string } & OpenDartCompany>(url);
    return res?.status === '000' ? res : null;
  }

  /** 최근 사업보고서 공시 목록 */
  private async fetchDisclosures(corpCode: string, apiKey: string): Promise<{ title: string; date: string; url: string }[]> {
    const bgn = this.yearsAgo(3);
    const url = `${OPEN_DART_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bgn_de=${bgn}&pblntf_ty=A&sort=date&page_count=5`;
    const res = await this.dartFetch<{ status: string; list?: OpenDartDisclosure[] }>(url);
    if (!res || res.status !== '000' || !res.list) return [];
    return res.list.map((d) => ({
      title: d.report_nm,
      date: this.formatDate(d.rcept_dt),
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,
    }));
  }

  /** 재무제표 (최근 3개 연도 중 성공하는 것 사용) */
  private async fetchFinancials(corpCode: string, apiKey: string): Promise<{
    revenue: string | null;
    operatingProfit: string | null;
    netIncome: string | null;
    totalAssets: string | null;
    totalEquity: string | null;
    fiscalYear: string | null;
  } | null> {
    const currentYear = new Date().getFullYear();

    for (let year = currentYear - 1; year >= currentYear - 3; year--) {
      const url = `${OPEN_DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${ANNUAL_REPORT_CODE}`;
      const res = await this.dartFetch<{ status: string; list?: OpenDartFinanceItem[] }>(url);
      if (!res || res.status !== '000' || !res.list?.length) continue;

      const find = (names: string[]) =>
        res.list!.find((item) => names.some((n) => item.account_nm.includes(n)))?.thstrm_amount ?? null;

      const revenue = find(['매출액', '수익(매출액)']);
      const operatingProfit = find(['영업이익', '영업손익']);
      const netIncome = find(['당기순이익', '당기순손익']);
      const totalAssets = find(['자산총계']);
      const totalEquity = find(['자본총계']);

      return {
        revenue: revenue ? this.formatAmount(revenue) : null,
        operatingProfit: operatingProfit ? this.formatAmount(operatingProfit) : null,
        netIncome: netIncome ? this.formatAmount(netIncome) : null,
        totalAssets: totalAssets ? this.formatAmount(totalAssets) : null,
        totalEquity: totalEquity ? this.formatAmount(totalEquity) : null,
        fiscalYear: `${year}년`,
      };
    }
    return null;
  }

  private async dartFetch<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ResearchAI/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      return res.json() as Promise<T>;
    } catch {
      return null;
    }
  }

  /** 원 단위 숫자를 억 단위 문자열로 변환 */
  private formatAmount(raw: string): string {
    const n = parseInt(raw.replace(/,/g, ''), 10);
    if (isNaN(n)) return raw;
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}조 원`;
    if (abs >= 100_000_000) return `${Math.round(n / 100_000_000).toLocaleString()}억 원`;
    if (abs >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만 원`;
    return `${n.toLocaleString()} 원`;
  }

  private formatDate(raw: string): string {
    if (raw.length === 8) return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
    return raw;
  }

  private yearsAgo(n: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  formatForAnalysis(data: DartFinancialData): string {
    const lines: string[] = [`## DART 재무 데이터: ${data.companyName}`];

    if (data.fiscalYear) lines.push(`- 회계연도: ${data.fiscalYear}`);
    if (data.ceoName) lines.push(`- 대표이사: ${data.ceoName}`);
    if (data.foundedDate) lines.push(`- 설립일: ${this.formatDate(data.foundedDate)}`);
    if (data.employees) lines.push(`- 직원 수: ${data.employees}명`);
    if (data.stockCode) lines.push(`- 종목코드: ${data.stockCode}`);
    if (data.revenue) lines.push(`- 매출액: ${data.revenue}`);
    if (data.operatingProfit) lines.push(`- 영업이익: ${data.operatingProfit}`);
    if (data.netIncome) lines.push(`- 당기순이익: ${data.netIncome}`);
    if (data.totalAssets) lines.push(`- 총자산: ${data.totalAssets}`);
    if (data.totalEquity) lines.push(`- 자본총계: ${data.totalEquity}`);

    if (data.disclosures.length > 0) {
      lines.push('\n### 최근 공시');
      data.disclosures.forEach((d) => lines.push(`- [${d.date}] ${d.title}`));
    }

    return lines.join('\n');
  }
}
