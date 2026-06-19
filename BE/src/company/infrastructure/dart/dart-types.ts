export interface YearlyFinancial {
  year: number;
  // 손익계산서
  revenue: number | null;
  revenueFormatted: string | null;
  grossProfit: number | null;
  grossMargin: number | null;
  operatingProfit: number | null;
  operatingProfitFormatted: string | null;
  netIncome: number | null;
  netIncomeFormatted: string | null;
  operatingMargin: number | null;
  netIncomeMargin: number | null;
  interestExpense: number | null;
  interestCoverageRatio: number | null;
  // 재무상태표
  totalAssets: number | null;
  nonCurrentAssets: number | null;
  tangibleAssets: number | null;
  intangibleAssets: number | null;
  totalLiabilities: number | null;
  nonCurrentLiabilities: number | null;
  totalEquity: number | null;
  capitalAmount: number | null;
  currentAssets: number | null;
  cashAndEquivalents: number | null;
  inventories: number | null;
  accountsReceivable: number | null;
  currentLiabilities: number | null;
  shortTermBorrowings: number | null;
  longTermBorrowings: number | null;
  bonds: number | null;
  totalBorrowings: number | null;
  netDebt: number | null;
  workingCapital: number | null;
  // 파생 비율
  debtRatio: number | null;
  currentRatio: number | null;
  netDebtRatio: number | null;
  // 현금흐름
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  // 추가 비율 및 주당 지표 (네이버 파싱 및 계산용)
  reserveRatio?: number | null;
  roe?: number | null;
  roa?: number | null;
  eps?: number | null;
  bps?: number | null;
  sps?: number | null;
  cps?: number | null;
  per?: number | null;
  pbr?: number | null;
  psr?: number | null;
  pcr?: number | null;
  dividend?: number | null;
  dividendYield?: number | null;
  dividendPayoutRatio?: number | null;
}

export interface QuarterlyFinancial extends YearlyFinancial {
  quarter: number;
  reportCode: string;
  rceptNo: string | null;
  periodLabel: string;
  basisLabel: string;
}

export interface EmployeeDetail {
  year: number;
  total: number | null;
  regular: number | null;
  contract: number | null;
  avgTenure: string | null;
  avgSalary: string | null;
  maleCount: number | null;
  femaleCount: number | null;
  maleTenure: string | null;
  femaleTenure: string | null;
  maleSalary: string | null;
  femaleSalary: string | null;
}

export interface DartFinancialData {
  companyName: string;
  corpCode: string | null;
  stockCode: string | null;
  corpClass: string | null;
  ceoName: string | null;
  foundedDate: string | null;
  employees: string | null;
  employeeHistory: EmployeeDetail[];
  capital: string | null;
  industry: string | null;
  homeUrl: string | null;
  address: string | null;
  dartUrl: string | null;
  fiscalMonth: string | null;
  revenue: string | null;
  operatingProfit: string | null;
  netIncome: string | null;
  totalAssets: string | null;
  totalEquity: string | null;
  fiscalYear: string | null;
  multiYearFinancials: YearlyFinancial[];
  disclosures: { title: string; date: string; url: string }[];
  businessContent: string | null;
}

export interface OpenDartCompany {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  ceo_nm: string;
  corp_cls: string;
  jurir_no: string;
  bizr_no: string;
  adres: string;
  hm_url: string;
  phn_no: string;
  est_dt: string;
  acc_mt: string;
}

export interface OpenDartFinanceItem {
  account_nm: string;
  thstrm_amount: string;
  rcept_no?: string;
  /** BS=재무상태표, IS=손익계산서, CIS=포괄손익, CF=현금흐름, SCE=자본변동 */
  sj_div?: string;
}

export interface OpenDartEmployee {
  fo_bbm: string;
  sexdstn_code_nm: string;
  rgllbr_co: string;
  cnttk_co: string;
  sm_empNo: string;
  avrg_cnwk_sdytrn: string;
  jan_pd_totamt: string;
  jan_pd_avramt: string;
}

export interface OpenDartDisclosure {
  report_nm: string;
  rcept_dt: string;
  rcept_no: string;
}
