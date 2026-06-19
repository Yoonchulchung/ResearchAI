import { Injectable, Logger } from '@nestjs/common';
import { DartApiQueueService } from 'src/company/infrastructure/dart-api-queue.service';
import { DartCorpCodeService } from './dart-corp-code.service';
import { DartReportService } from './dart-report.service';
import {
  YearlyFinancial,
  QuarterlyFinancial,
  EmployeeDetail,
  DartFinancialData,
  OpenDartCompany,
  OpenDartFinanceItem,
  OpenDartEmployee,
  OpenDartDisclosure,
} from './dart-types';

export type {
  YearlyFinancial,
  QuarterlyFinancial,
  EmployeeDetail,
  DartFinancialData,
};

const OPEN_DART_BASE = 'https://opendart.fss.or.kr/api';
const ANNUAL_REPORT_CODE = '11011';

@Injectable()
export class DartFinancialService {
  private readonly logger = new Logger(DartFinancialService.name);

  constructor(
    private readonly dartQueue: DartApiQueueService,
    private readonly corpCode: DartCorpCodeService,
    private readonly report: DartReportService,
  ) {}

  async fetchCompanyData(
    companyName: string,
    dartApiKey?: string | null,
  ): Promise<DartFinancialData | null> {
    if (!dartApiKey) return null;
    return this.dartQueue.run(companyName, () =>
      this.doFetch(companyName, dartApiKey),
    );
  }

  private async doFetch(
    companyName: string,
    dartApiKey: string,
  ): Promise<DartFinancialData | null> {
    try {
      const code = await this.corpCode.findCorpCode(companyName, dartApiKey);
      if (!code) {
        this.logger.warn(`[DART] "${companyName}" 기업 코드 조회 실패`);
        return null;
      }

      const [companyRes, disclosuresRes, multiYearRes, employeeHistoryRes] =
        await Promise.allSettled([
          this.fetchCompanyInfo(code, dartApiKey),
          this.fetchDisclosures(code, dartApiKey),
          this.fetchMultiYearFinancials(code, dartApiKey),
          this.fetchEmployeeHistory(code, dartApiKey),
        ]);

      if (companyRes.status === 'rejected')
        this.logger.error(`[DART] 기업정보 오류: ${companyRes.reason}`);
      if (disclosuresRes.status === 'rejected')
        this.logger.error(`[DART] 공시 오류: ${disclosuresRes.reason}`);
      if (multiYearRes.status === 'rejected')
        this.logger.error(`[DART] 재무 오류: ${multiYearRes.reason}`);

      const company =
        companyRes.status === 'fulfilled' ? companyRes.value : null;
      const { list: disclosures, latestAnnualRceptNo } =
        disclosuresRes.status === 'fulfilled'
          ? disclosuresRes.value
          : { list: [], latestAnnualRceptNo: null };
      const { financials: multiYearFinancials, latestCapital } =
        multiYearRes.status === 'fulfilled'
          ? multiYearRes.value
          : { financials: [], latestCapital: null };
      const employeeHistory =
        employeeHistoryRes.status === 'fulfilled'
          ? (employeeHistoryRes.value ?? [])
          : [];
      const latestEmp = employeeHistory.at(-1) ?? null;
      const employees = latestEmp
        ? `${(latestEmp.total ?? 0).toLocaleString()}명`
        : null;

      const latest = multiYearFinancials.at(-1) ?? null;

      let businessContent: string | null = null;
      if (latestAnnualRceptNo) {
        businessContent =
          await this.report.fetchAnnualReportSections(latestAnnualRceptNo);
      }

      return {
        companyName,
        corpCode: code,
        stockCode: company?.stock_code || null,
        corpClass: company?.corp_cls || null,
        ceoName: company?.ceo_nm || null,
        foundedDate: company?.est_dt || null,
        employees,
        employeeHistory,
        capital: latestCapital,
        industry: null,
        homeUrl: company?.hm_url?.startsWith('http') ? company.hm_url : null,
        address: company?.adres || null,
        dartUrl: `https://dart.fss.or.kr/corp/searchCorpInfo.do?corp_code=${code}`,
        fiscalMonth: company?.acc_mt ? `${company.acc_mt}월` : null,
        revenue: latest?.revenueFormatted ?? null,
        operatingProfit: latest?.operatingProfitFormatted ?? null,
        netIncome: latest?.netIncomeFormatted ?? null,
        totalAssets: null,
        totalEquity: null,
        fiscalYear: latest ? `${latest.year}년` : null,
        multiYearFinancials,
        disclosures,
        businessContent,
      };
    } catch (err) {
      this.logger.error(
        `[DART] 최상위 오류: ${(err as Error).message}\n${(err as Error).stack}`,
      );
      return null;
    }
  }

  private async fetchCompanyInfo(
    corpCode: string,
    apiKey: string,
  ): Promise<OpenDartCompany | null> {
    const url = `${OPEN_DART_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
    const res = await this.dartFetch<
      { status: string; message?: string } & OpenDartCompany
    >(url);
    return res?.status === '000' ? res : null;
  }

  private async fetchDisclosures(
    corpCode: string,
    apiKey: string,
  ): Promise<{
    list: { title: string; date: string; url: string }[];
    latestAnnualRceptNo: string | null;
  }> {
    const bgn = this.dateYearsAgo(2);
    const url = `${OPEN_DART_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bgn_de=${bgn}&pblntf_ty=A&sort=date&page_count=10`;
    const res = await this.dartFetch<{
      status: string;
      message?: string;
      list?: OpenDartDisclosure[];
    }>(url);
    if (!res || res.status !== '000' || !res.list)
      return { list: [], latestAnnualRceptNo: null };
    const latestAnnual = res.list.find((d) =>
      d.report_nm.includes('사업보고서'),
    );
    return {
      list: res.list.map((d) => ({
        title: d.report_nm,
        date: this.fmtDate(d.rcept_dt),
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,
      })),
      latestAnnualRceptNo: latestAnnual?.rcept_no ?? null,
    };
  }

  async fetchMultiYearFinancials(
    corpCode: string,
    apiKey: string,
  ): Promise<{ financials: YearlyFinancial[]; latestCapital: string | null }> {
    const currentYear = new Date().getFullYear();
    const results: YearlyFinancial[] = [];
    let latestCapital: string | null = null;

    const yearRange = [currentYear - 3, currentYear - 2, currentYear - 1];
    const responses = await Promise.allSettled(
      yearRange.map(async (year) => {
        const [r, baseList] = await Promise.all([
          this.fetchAllAccounts(corpCode, year, ANNUAL_REPORT_CODE, apiKey),
          this.fetchBaseAccounts(corpCode, year, ANNUAL_REPORT_CODE, apiKey),
        ]);
        return { year, r, baseList };
      }),
    );

    for (const settled of responses) {
      if (settled.status !== 'fulfilled') continue;
      const { year, r, baseList } = settled.value;
      if (!r || r.status !== '000' || !r.list?.length) continue;

      const allList = r.list!;
      // 전체계정 우선 → 기본계정 fallback
      const find = (names: string[], sjDiv?: string) => {
        const fromAll = allList.find(
          (item) =>
            (!sjDiv || item.sj_div === sjDiv) &&
            names.some((n) => item.account_nm.includes(n)),
        )?.thstrm_amount ?? null;
        if (fromAll !== null) return fromAll;
        return baseList.find((item) =>
          names.some((n) => item.account_nm.includes(n)),
        )?.thstrm_amount ?? null;
      };

      // 손익계산서 (IS 우선, 없으면 CIS)
      const revenueRaw =
        find(['매출액', '수익(매출액)'], 'IS') ??
        find(['매출액', '수익(매출액)'], 'CIS') ??
        find(['매출액', '수익(매출액)', '영업수익']);
      const grossProfitRaw =
        find(['매출총이익', '매출총손익'], 'IS') ??
        find(['매출총이익', '매출총손익'], 'CIS') ??
        find(['매출총이익', '매출총손익']);
      const opRaw =
        find(['영업이익', '영업손익'], 'IS') ??
        find(['영업이익', '영업손익'], 'CIS') ??
        find(['영업이익', '영업손익']);
      const niRaw =
        find(['당기순이익', '당기순손익'], 'IS') ??
        find(['당기순이익', '당기순손익'], 'CIS') ??
        find(['당기순이익', '당기순손익']);
      const interestExpenseRaw =
        find(['이자비용'], 'IS') ??
        find(['이자비용'], 'CIS') ??
        find(['이자비용', '금융원가']);
      // 재무상태표 (BS)
      const capitalRaw = find(['자본금'], 'BS') ?? find(['자본금']);
      const totalAssetsRaw = find(['자산총계'], 'BS') ?? find(['자산총계']);
      const nonCurrentAssetsRaw = find(['비유동자산'], 'BS') ?? find(['비유동자산']);
      const tangibleAssetsRaw = find(['유형자산'], 'BS') ?? find(['유형자산']);
      const intangibleAssetsRaw = find(['무형자산'], 'BS') ?? find(['무형자산']);
      const totalLiabilitiesRaw = find(['부채총계'], 'BS') ?? find(['부채총계']);
      const nonCurrentLiabRaw = find(['비유동부채'], 'BS') ?? find(['비유동부채']);
      const totalEquityRaw = find(['자본총계'], 'BS') ?? find(['자본총계']);
      const currentAssetsRaw = find(['유동자산'], 'BS') ?? find(['유동자산']);
      const cashRaw =
        find(['현금및현금성자산', '현금 및 현금성자산'], 'BS') ??
        find(['현금및현금성자산', '현금 및 현금성자산']);
      const inventoriesRaw = find(['재고자산'], 'BS') ?? find(['재고자산']);
      const receivablesRaw =
        find(['매출채권및기타채권', '매출채권', '매출채권 및 기타채권'], 'BS') ??
        find(['매출채권및기타채권', '매출채권', '매출채권 및 기타채권']);
      const currentLiabRaw = find(['유동부채'], 'BS') ?? find(['유동부채']);
      const shortTermBorrowRaw = find(['단기차입금'], 'BS') ?? find(['단기차입금']);
      const longTermBorrowRaw = find(['장기차입금'], 'BS') ?? find(['장기차입금']);
      const bondsRaw = find(['사채'], 'BS') ?? find(['사채']);
      // 현금흐름표 (CF)
      const opCashRaw =
        find(['영업활동으로 인한 현금흐름', '영업활동현금흐름', '영업활동으로인한현금흐름'], 'CF') ??
        find(['영업활동으로 인한 현금흐름', '영업활동현금흐름', '영업활동으로인한현금흐름']);
      const invCashRaw =
        find(['투자활동으로 인한 현금흐름', '투자활동현금흐름', '투자활동으로인한현금흐름'], 'CF') ??
        find(['투자활동으로 인한 현금흐름', '투자활동현금흐름', '투자활동으로인한현금흐름']);
      const finCashRaw =
        find(['재무활동으로 인한 현금흐름', '재무활동현금흐름', '재무활동으로인한현금흐름'], 'CF') ??
        find(['재무활동으로 인한 현금흐름', '재무활동현금흐름', '재무활동으로인한현금흐름']);

      const toEok = (raw: string | null) => {
        if (!raw) return null;
        const n = parseInt(raw.replace(/,/g, ''), 10);
        return isNaN(n) ? null : Math.round(n / 100_000_000);
      };
      const toWon = (raw: string | null) => {
        if (!raw) return null;
        const n = Number(raw.replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
      };
      const add = (a: number | null, b: number | null) =>
        a != null || b != null ? (a ?? 0) + (b ?? 0) : null;

      const revenue = toEok(revenueRaw);
      const operatingProfit = toEok(opRaw);
      const netIncome = toEok(niRaw);
      const grossProfit = toEok(grossProfitRaw);
      const interestExpense = toEok(interestExpenseRaw);
      const totalAssets = toEok(totalAssetsRaw);
      const nonCurrentAssets = toEok(nonCurrentAssetsRaw);
      const tangibleAssets = toEok(tangibleAssetsRaw);
      const intangibleAssets = toEok(intangibleAssetsRaw);
      const totalLiabilities = toEok(totalLiabilitiesRaw);
      const nonCurrentLiabilities = toEok(nonCurrentLiabRaw);
      const totalEquity = toEok(totalEquityRaw);
      const currentAssets = toEok(currentAssetsRaw);
      const cashAndEquivalents = toEok(cashRaw);
      const inventories = toEok(inventoriesRaw);
      const accountsReceivable = toEok(receivablesRaw);
      const currentLiabilities = toEok(currentLiabRaw);
      const shortTermBorrowings = toEok(shortTermBorrowRaw);
      const longTermBorrowings = toEok(longTermBorrowRaw);
      const bonds = toEok(bondsRaw);
      const capitalAmount = toEok(capitalRaw);

      const totalBorrowings = add(add(shortTermBorrowings, longTermBorrowings), bonds);
      const netDebt =
        totalBorrowings != null && cashAndEquivalents != null
          ? totalBorrowings - cashAndEquivalents
          : null;
      const workingCapital =
        currentAssets != null && currentLiabilities != null
          ? currentAssets - currentLiabilities
          : null;

      const pct = (a: number | null, b: number | null) =>
        a != null && b != null && b !== 0
          ? Math.round((a / b) * 1000) / 10
          : null;
      const ratio = (a: number | null, b: number | null) =>
        a != null && b != null && b !== 0
          ? Math.round((a / b) * 100) / 100
          : null;

      if (capitalRaw) latestCapital = this.fmtAmount(capitalRaw);

      results.push({
        year,
        revenue,
        revenueFormatted: revenueRaw ? this.fmtAmount(revenueRaw) : null,
        grossProfit,
        grossMargin: pct(toWon(grossProfitRaw), toWon(revenueRaw)),
        operatingProfit,
        operatingProfitFormatted: opRaw ? this.fmtAmount(opRaw) : null,
        netIncome,
        netIncomeFormatted: niRaw ? this.fmtAmount(niRaw) : null,
        operatingMargin: pct(toWon(opRaw), toWon(revenueRaw)),
        netIncomeMargin: pct(toWon(niRaw), toWon(revenueRaw)),
        interestExpense,
        interestCoverageRatio: ratio(toWon(opRaw), toWon(interestExpenseRaw)),
        totalAssets,
        nonCurrentAssets,
        tangibleAssets,
        intangibleAssets,
        totalLiabilities,
        nonCurrentLiabilities,
        totalEquity,
        capitalAmount,
        currentAssets,
        cashAndEquivalents,
        inventories,
        accountsReceivable,
        currentLiabilities,
        shortTermBorrowings,
        longTermBorrowings,
        bonds,
        totalBorrowings,
        netDebt,
        workingCapital,
        debtRatio: pct(toWon(totalLiabilitiesRaw), toWon(totalEquityRaw)),
        currentRatio: pct(toWon(currentAssetsRaw), toWon(currentLiabRaw)),
        netDebtRatio: pct(netDebt, totalEquity),
        operatingCashFlow: toEok(opCashRaw),
        investingCashFlow: toEok(invCashRaw),
        financingCashFlow: toEok(finCashRaw),
      });
    }

    return {
      financials: results.sort((a, b) => a.year - b.year),
      latestCapital,
    };
  }

  async fetchRecentQuarterlyFinancials(
    corpCode: string,
    apiKey: string,
  ): Promise<QuarterlyFinancial[]> {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear];
    const reports = [
      { quarter: 1, reportCode: '11013', month: '03' },
      { quarter: 2, reportCode: '11012', month: '06' },
      { quarter: 3, reportCode: '11014', month: '09' },
      { quarter: 4, reportCode: ANNUAL_REPORT_CODE, month: '12' },
    ];
    const currentMonth = new Date().getMonth() + 1;
    const latestAvailableCurrentQuarter =
      currentMonth >= 11
        ? 3
        : currentMonth >= 8
          ? 2
          : currentMonth >= 5
            ? 1
            : 0;
    type CumulativeQuarter = QuarterlyFinancial & {
      cumulativeRevenue: number | null;
      cumulativeOperatingProfit: number | null;
      cumulativeNetIncome: number | null;
    };

    const toEok = (raw: string | null) => {
      if (!raw) return null;
      const n = parseInt(raw.replace(/,/g, ''), 10);
      return isNaN(n) ? null : Math.round(n / 100_000_000);
    };
    const toWon = (raw: string | null) => {
      if (!raw) return null;
      const n = Number(raw.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const pct = (a: number | null, b: number | null) =>
      a != null && b != null && b !== 0
        ? Math.round((a / b) * 1000) / 10
        : null;

    const settled = await Promise.allSettled(
      years.flatMap((year) =>
        reports
          .filter(
            (report) =>
              year < currentYear ||
              report.quarter <= latestAvailableCurrentQuarter,
          )
          .map(async (report) => {
            const [r, baseList] = await Promise.all([
              this.fetchAllAccounts(corpCode, year, report.reportCode, apiKey),
              this.fetchBaseAccounts(corpCode, year, report.reportCode, apiKey),
            ]);
            return { year, report, r, baseList };
          }),
      ),
    );

    const byYear = new Map<number, CumulativeQuarter[]>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const { year, report, r, baseList } = result.value;
      if (!r || r.status !== '000' || !r.list?.length) continue;

      const allList = r.list!;
      const find = (names: string[], sjDiv?: string) => {
        const fromAll = allList.find(
          (item) =>
            (!sjDiv || item.sj_div === sjDiv) &&
            names.some((n) => item.account_nm.includes(n)),
        )?.thstrm_amount ?? null;
        if (fromAll !== null) return fromAll;
        return baseList.find((item) =>
          names.some((n) => item.account_nm.includes(n)),
        )?.thstrm_amount ?? null;
      };
      // 손익계산서
      const revenueRaw =
        find(['매출액', '수익(매출액)'], 'IS') ??
        find(['매출액', '수익(매출액)'], 'CIS') ??
        find(['매출액', '수익(매출액)', '영업수익']);
      const grossProfitRaw =
        find(['매출총이익', '매출총손익'], 'IS') ??
        find(['매출총이익', '매출총손익'], 'CIS') ??
        find(['매출총이익', '매출총손익']);
      const operatingProfitRaw =
        find(['영업이익', '영업손익'], 'IS') ??
        find(['영업이익', '영업손익'], 'CIS') ??
        find(['영업이익', '영업손익']);
      const netIncomeRaw =
        find(['당기순이익', '당기순손익'], 'IS') ??
        find(['당기순이익', '당기순손익'], 'CIS') ??
        find(['당기순이익', '당기순손익']);
      const interestExpenseRaw =
        find(['이자비용'], 'IS') ??
        find(['이자비용'], 'CIS') ??
        find(['이자비용', '금융원가']);
      // 재무상태표
      const totalAssetsRaw = find(['자산총계'], 'BS') ?? find(['자산총계']);
      const nonCurrentAssetsRaw = find(['비유동자산'], 'BS') ?? find(['비유동자산']);
      const tangibleAssetsRaw = find(['유형자산'], 'BS') ?? find(['유형자산']);
      const intangibleAssetsRaw = find(['무형자산'], 'BS') ?? find(['무형자산']);
      const totalLiabilitiesRaw = find(['부채총계'], 'BS') ?? find(['부채총계']);
      const nonCurrentLiabRaw = find(['비유동부채'], 'BS') ?? find(['비유동부채']);
      const totalEquityRaw = find(['자본총계'], 'BS') ?? find(['자본총계']);
      const currentAssetsRaw = find(['유동자산'], 'BS') ?? find(['유동자산']);
      const cashRaw =
        find(['현금및현금성자산', '현금 및 현금성자산'], 'BS') ??
        find(['현금및현금성자산', '현금 및 현금성자산']);
      const inventoriesRaw = find(['재고자산'], 'BS') ?? find(['재고자산']);
      const receivablesRaw =
        find(['매출채권및기타채권', '매출채권', '매출채권 및 기타채권'], 'BS') ??
        find(['매출채권및기타채권', '매출채권', '매출채권 및 기타채권']);
      const currentLiabilitiesRaw = find(['유동부채'], 'BS') ?? find(['유동부채']);
      const shortTermBorrowRaw = find(['단기차입금'], 'BS') ?? find(['단기차입금']);
      const longTermBorrowRaw = find(['장기차입금'], 'BS') ?? find(['장기차입금']);
      const bondsRaw = find(['사채'], 'BS') ?? find(['사채']);
      const revenue = toEok(revenueRaw);
      const grossProfit = toEok(grossProfitRaw);
      const operatingProfit = toEok(operatingProfitRaw);
      const netIncome = toEok(netIncomeRaw);
      const interestExpense = toEok(interestExpenseRaw);
      const totalAssets = toEok(totalAssetsRaw);
      const nonCurrentAssets = toEok(nonCurrentAssetsRaw);
      const tangibleAssets = toEok(tangibleAssetsRaw);
      const intangibleAssets = toEok(intangibleAssetsRaw);
      const totalLiabilities = toEok(totalLiabilitiesRaw);
      const nonCurrentLiabilities = toEok(nonCurrentLiabRaw);
      const totalEquity = toEok(totalEquityRaw);
      const currentAssets = toEok(currentAssetsRaw);
      const cashAndEquivalents = toEok(cashRaw);
      const inventories = toEok(inventoriesRaw);
      const accountsReceivable = toEok(receivablesRaw);
      const currentLiabilities = toEok(currentLiabilitiesRaw);
      const shortTermBorrowings = toEok(shortTermBorrowRaw);
      const longTermBorrowings = toEok(longTermBorrowRaw);
      const bonds = toEok(bondsRaw);
      const capitalAmount = toEok(find(['자본금'], 'BS') ?? find(['자본금']));
      const addNull = (a: number | null, b: number | null) =>
        a != null || b != null ? (a ?? 0) + (b ?? 0) : null;
      const totalBorrowings = addNull(addNull(shortTermBorrowings, longTermBorrowings), bonds);
      const netDebt =
        totalBorrowings != null && cashAndEquivalents != null
          ? totalBorrowings - cashAndEquivalents : null;
      const workingCapital =
        currentAssets != null && currentLiabilities != null
          ? currentAssets - currentLiabilities : null;
      const CF_NAMES = {
        op: ['영업활동으로 인한 현금흐름', '영업활동현금흐름', '영업활동으로인한현금흐름'],
        inv: ['투자활동으로 인한 현금흐름', '투자활동현금흐름', '투자활동으로인한현금흐름'],
        fin: ['재무활동으로 인한 현금흐름', '재무활동현금흐름', '재무활동으로인한현금흐름'],
      };
      const operatingCashFlow = toEok(find(CF_NAMES.op, 'CF') ?? find(CF_NAMES.op));
      const investingCashFlow = toEok(find(CF_NAMES.inv, 'CF') ?? find(CF_NAMES.inv));
      const financingCashFlow = toEok(find(CF_NAMES.fin, 'CF') ?? find(CF_NAMES.fin));

      const item: CumulativeQuarter = {
        year,
        quarter: report.quarter,
        reportCode: report.reportCode,
        rceptNo: r.list[0]?.rcept_no ?? null,
        periodLabel: `${year}.${report.month}.`,
        basisLabel: `${year}. ${Number(report.month)}. 기준`,
        revenue,
        revenueFormatted:
          revenue != null ? `${revenue.toLocaleString('ko-KR')}억 원` : null,
        grossProfit,
        grossMargin: pct(toWon(grossProfitRaw), toWon(revenueRaw)),
        operatingProfit,
        operatingProfitFormatted:
          operatingProfit != null
            ? `${operatingProfit.toLocaleString('ko-KR')}억 원`
            : null,
        netIncome,
        netIncomeFormatted:
          netIncome != null
            ? `${netIncome.toLocaleString('ko-KR')}억 원`
            : null,
        operatingMargin: pct(toWon(operatingProfitRaw), toWon(revenueRaw)),
        netIncomeMargin: pct(toWon(netIncomeRaw), toWon(revenueRaw)),
        interestExpense,
        interestCoverageRatio:
          operatingProfit != null && interestExpense != null && interestExpense !== 0
            ? Math.round((operatingProfit / interestExpense) * 100) / 100 : null,
        totalAssets,
        nonCurrentAssets,
        tangibleAssets,
        intangibleAssets,
        totalLiabilities,
        nonCurrentLiabilities,
        totalEquity,
        capitalAmount,
        currentAssets,
        cashAndEquivalents,
        inventories,
        accountsReceivable,
        currentLiabilities,
        shortTermBorrowings,
        longTermBorrowings,
        bonds,
        totalBorrowings,
        netDebt,
        workingCapital,
        debtRatio: pct(toWon(totalLiabilitiesRaw), toWon(totalEquityRaw)),
        currentRatio: pct(toWon(currentAssetsRaw), toWon(currentLiabilitiesRaw)),
        netDebtRatio: pct(netDebt, totalEquity),
        operatingCashFlow,
        investingCashFlow,
        financingCashFlow,
        cumulativeRevenue: revenue,
        cumulativeOperatingProfit: operatingProfit,
        cumulativeNetIncome: netIncome,
      };

      const list = byYear.get(year) ?? [];
      list.push(item);
      byYear.set(year, list);
    }

    const quarters: QuarterlyFinancial[] = [];
    for (const list of byYear.values()) {
      const sorted = list.sort((a, b) => a.quarter - b.quarter);
      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const prev = sorted[i - 1] ?? null;
        const revenue =
          current.cumulativeRevenue != null
            ? current.cumulativeRevenue - (prev?.cumulativeRevenue ?? 0)
            : null;
        const operatingProfit =
          current.cumulativeOperatingProfit != null
            ? current.cumulativeOperatingProfit -
              (prev?.cumulativeOperatingProfit ?? 0)
            : null;
        const netIncome =
          current.cumulativeNetIncome != null
            ? current.cumulativeNetIncome - (prev?.cumulativeNetIncome ?? 0)
            : null;

        quarters.push({
          ...current,
          revenue,
          revenueFormatted:
            revenue != null ? `${revenue.toLocaleString('ko-KR')}억 원` : null,
          operatingProfit,
          operatingProfitFormatted:
            operatingProfit != null
              ? `${operatingProfit.toLocaleString('ko-KR')}억 원`
              : null,
          netIncome,
          netIncomeFormatted:
            netIncome != null
              ? `${netIncome.toLocaleString('ko-KR')}억 원`
              : null,
          operatingMargin: pct(operatingProfit, revenue),
          netIncomeMargin: pct(netIncome, revenue),
        });
      }
    }

    return quarters
      .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
      .slice(-8);
  }

  // PDF/HTML 파싱은 DartReportService에 위임
  async fetchAnnualReportSections(rceptNo: string): Promise<string | null> {
    return this.report.fetchAnnualReportSections(rceptNo);
  }

  async resolveDisclosurePdfUrl(disclosureUrl: string): Promise<string | null> {
    return this.report.resolveDisclosurePdfUrl(disclosureUrl);
  }

  async fetchDisclosurePdf(disclosureUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
    contentDisposition: string | null;
  } | null> {
    return this.report.fetchDisclosurePdf(disclosureUrl);
  }

  private async fetchEmployeeHistory(
    corpCode: string,
    apiKey: string,
  ): Promise<EmployeeDetail[]> {
    const latestYear = new Date().getFullYear() - 1;
    const years = [latestYear - 1, latestYear];
    const settled = await Promise.allSettled(
      years.map((y) => this.fetchEmployeeForYear(corpCode, apiKey, y)),
    );
    const results = settled
      .filter(
        (r): r is PromiseFulfilledResult<EmployeeDetail | null> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value)
      .filter((v): v is EmployeeDetail => v != null);
    if (!results.length) {
      const older = await this.fetchEmployeeForYear(
        corpCode,
        apiKey,
        latestYear - 2,
      );
      if (older) results.push(older);
    }
    return results.sort((a, b) => a.year - b.year);
  }

  private async fetchEmployeeForYear(
    corpCode: string,
    apiKey: string,
    year: number,
  ): Promise<EmployeeDetail | null> {
    const url = `${OPEN_DART_BASE}/empSttus.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${ANNUAL_REPORT_CODE}`;
    const res = await this.dartFetch<{
      status: string;
      list?: OpenDartEmployee[];
    }>(url);

    if (!res || res.status !== '000' || !res.list?.length) return null;

    const toNum = (s: string | undefined) => {
      const n = parseInt((s ?? '').replace(/,/g, ''), 10);
      return isNaN(n) || n < 0 ? null : n;
    };
    const toTenure = (s: string | undefined) => {
      const n = parseFloat((s ?? '').replace(/,/g, ''));
      return isNaN(n) || n <= 0 ? null : `${n}년`;
    };
    const toSalary = (s: string | undefined) => {
      const n = parseInt((s ?? '').replace(/,/g, ''), 10);
      if (isNaN(n) || n <= 0) return null;
      return n >= 10000
        ? `${(n / 10000).toFixed(1)}억원`
        : `${(n / 10).toFixed(0)}만원`;
    };

    const rows = res.list;
    const totalRow =
      rows.find(
        (r) =>
          r.fo_bbm?.includes('합계') &&
          (r.sexdstn_code_nm?.includes('합계') || !r.sexdstn_code_nm),
      ) ??
      rows.find((r) => r.fo_bbm?.includes('합계')) ??
      rows[0];

    const maleRow = rows.find(
      (r) => r.fo_bbm?.includes('합계') && r.sexdstn_code_nm?.includes('남'),
    );
    const femaleRow = rows.find(
      (r) => r.fo_bbm?.includes('합계') && r.sexdstn_code_nm?.includes('여'),
    );

    const total = toNum(totalRow?.sm_empNo);
    if (!total) return null;

    return {
      year,
      total,
      regular: toNum(totalRow?.rgllbr_co),
      contract: toNum(totalRow?.cnttk_co),
      avgTenure: toTenure(totalRow?.avrg_cnwk_sdytrn),
      avgSalary: toSalary(totalRow?.jan_pd_avramt),
      maleCount: toNum(maleRow?.sm_empNo),
      femaleCount: toNum(femaleRow?.sm_empNo),
      maleTenure: toTenure(maleRow?.avrg_cnwk_sdytrn),
      femaleTenure: toTenure(femaleRow?.avrg_cnwk_sdytrn),
      maleSalary: toSalary(maleRow?.jan_pd_avramt),
      femaleSalary: toSalary(femaleRow?.jan_pd_avramt),
    };
  }

  corpClassLabel(cls: string | null): string {
    const map: Record<string, string> = {
      Y: '유가증권(KOSPI)',
      K: '코스닥(KOSDAQ)',
      N: '코넥스',
      E: '비상장',
    };
    return cls ? (map[cls] ?? cls) : '비상장';
  }

  formatForAnalysis(data: DartFinancialData): string {
    const lines: string[] = [`## DART 재무 데이터: ${data.companyName}`];
    if (data.fiscalYear) lines.push(`- 회계연도: ${data.fiscalYear}`);
    if (data.corpClass)
      lines.push(`- 상장: ${this.corpClassLabel(data.corpClass)}`);
    if (data.ceoName) lines.push(`- 대표이사: ${data.ceoName}`);
    if (data.foundedDate)
      lines.push(`- 설립일: ${this.fmtDate(data.foundedDate)}`);
    if (data.revenue) lines.push(`- 매출액: ${data.revenue}`);
    if (data.operatingProfit) lines.push(`- 영업이익: ${data.operatingProfit}`);
    if (data.netIncome) lines.push(`- 당기순이익: ${data.netIncome}`);

    if (data.employeeHistory?.length) {
      for (const e of data.employeeHistory) {
        lines.push(`\n### 직원 현황 (${e.year}년 DART)`);
        if (e.total != null)
          lines.push(`- 총 직원수: ${e.total.toLocaleString()}명`);
        if (e.regular != null && e.contract != null && e.total) {
          const rPct = Math.round((e.regular / e.total) * 100);
          lines.push(
            `- 근무형태: 정규직 ${e.regular.toLocaleString()}명(${rPct}%), 계약직 ${e.contract.toLocaleString()}명(${100 - rPct}%)`,
          );
        }
        if (e.maleCount != null && e.femaleCount != null && e.total) {
          const mPct = Math.round((e.maleCount / e.total) * 100);
          lines.push(
            `- 성별: 남성 ${e.maleCount.toLocaleString()}명(${mPct}%), 여성 ${e.femaleCount.toLocaleString()}명(${100 - mPct}%)`,
          );
        }
        if (e.avgTenure)
          lines.push(
            `- 평균 근속연수: ${e.avgTenure} (남성 ${e.maleTenure ?? '—'} / 여성 ${e.femaleTenure ?? '—'})`,
          );
        if (e.avgSalary)
          lines.push(
            `- 1인 평균급여: ${e.avgSalary} (남성 ${e.maleSalary ?? '—'} / 여성 ${e.femaleSalary ?? '—'})`,
          );
      }
    }

    if (data.businessContent) {
      lines.push('\n### DART 사업보고서 — 사업의 내용 (II)');
      lines.push(data.businessContent);
    }

    if (data.disclosures.length > 0) {
      lines.push('\n### 최근 공시');
      data.disclosures
        .slice(0, 5)
        .forEach((d) => lines.push(`- [${d.date}] ${d.title}`));
    }
    return lines.join('\n');
  }

  /** fnlttSinglAcntAll(전체계정) CFS → OFS 순으로 시도. 둘 다 없으면 null. */
  private async fetchAllAccounts(
    corpCode: string,
    year: number,
    reportCode: string,
    apiKey: string,
  ): Promise<{ status: string; list?: OpenDartFinanceItem[] } | null> {
    const base = `${OPEN_DART_BASE}/fnlttSinglAcntAll.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reportCode}`;
    for (const fsDiv of ['CFS', 'OFS'] as const) {
      const r = await this.dartFetch<{
        status: string;
        message?: string;
        list?: OpenDartFinanceItem[];
      }>(`${base}&fs_div=${fsDiv}`);
      if (r?.status === '000' && r.list?.length) return r;
    }
    return null;
  }

  /** fnlttSinglAcnt(주요계정) CFS → OFS 순으로 시도. 기본 계정의 fallback 소스로 사용. */
  private async fetchBaseAccounts(
    corpCode: string,
    year: number,
    reportCode: string,
    apiKey: string,
  ): Promise<OpenDartFinanceItem[]> {
    const base = `${OPEN_DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reportCode}`;
    for (const fsDiv of ['CFS', 'OFS'] as const) {
      const r = await this.dartFetch<{
        status: string;
        list?: OpenDartFinanceItem[];
      }>(`${base}&fs_div=${fsDiv}`);
      if (r?.status === '000' && r.list?.length) return r.list;
    }
    return [];
  }

  private async dartFetch<T>(url: string): Promise<T | null> {
    const shortUrl = url.replace(/crtfc_key=[^&]+/, 'crtfc_key=***');
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ResearchAI/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.error(`[DART] HTTP ${res.status} — ${shortUrl}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.error(
        `[DART] fetch 오류 — ${shortUrl}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private fmtAmount(raw: string): string {
    const n = parseInt(raw.replace(/,/g, ''), 10);
    if (isNaN(n)) return raw;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000_000)
      return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조 원`;
    if (abs >= 100_000_000)
      return `${sign}${Math.round(abs / 100_000_000).toLocaleString()}억 원`;
    if (abs >= 10_000)
      return `${sign}${Math.round(abs / 10_000).toLocaleString()}만 원`;
    return `${n.toLocaleString()} 원`;
  }

  private fmtDate(raw: string): string {
    if (raw.length === 8)
      return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
    return raw;
  }

  private dateYearsAgo(n: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }
}

