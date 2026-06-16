import { Injectable, Logger } from '@nestjs/common';
import { inflateRaw } from 'zlib';
import { promisify } from 'util';
import { DartApiQueueService } from './dart-api-queue.service';

const inflateRawAsync = promisify(inflateRaw);

const OPEN_DART_BASE = 'https://opendart.fss.or.kr/api';
const ANNUAL_REPORT_CODE = '11011';
const CORP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

export interface YearlyFinancial {
  year: number;
  // 손익계산서
  revenue: number | null;
  revenueFormatted: string | null;
  operatingProfit: number | null;
  operatingProfitFormatted: string | null;
  netIncome: number | null;
  netIncomeFormatted: string | null;
  operatingMargin: number | null;  // 영업이익률(%)
  netIncomeMargin: number | null;  // 순이익률(%)
  // 재무상태표
  totalAssets: number | null;      // 자산총계(억)
  totalLiabilities: number | null; // 부채총계(억)
  totalEquity: number | null;      // 자본총계(억)
  capitalAmount: number | null;    // 자본금(억)
  currentAssets: number | null;    // 유동자산(억)
  currentLiabilities: number | null; // 유동부채(억)
  // 파생 비율
  debtRatio: number | null;        // 부채비율(%) = 부채총계/자본총계*100
  currentRatio: number | null;     // 유동비율(%) = 유동자산/유동부채*100
  // 현금흐름
  operatingCashFlow: number | null;   // 영업활동현금흐름(억)
  investingCashFlow: number | null;   // 투자활동현금흐름(억)
  financingCashFlow: number | null;   // 재무활동현금흐름(억)
}

export interface EmployeeDetail {
  year: number;
  total: number | null;
  regular: number | null;
  contract: number | null;
  avgTenure: string | null;      // 예: "17.5년"
  avgSalary: string | null;      // 예: "5,400만원"
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
  corpClass: string | null;      // Y=유가증권 K=코스닥 N=코넥스 E=기타
  ceoName: string | null;
  foundedDate: string | null;
  employees: string | null;          // 예: "15,234명" (최신 연도 총계, 하위 호환용)
  employeeHistory: EmployeeDetail[]; // 연도별 직원 현황 (오름차순)
  capital: string | null;        // 자본금, 예: "897억 원"
  industry: string | null;
  homeUrl: string | null;
  address: string | null;
  dartUrl: string | null;
  fiscalMonth: string | null;
  // 최신 연도 요약
  revenue: string | null;
  operatingProfit: string | null;
  netIncome: string | null;
  totalAssets: string | null;
  totalEquity: string | null;
  fiscalYear: string | null;
  // 다년도
  multiYearFinancials: YearlyFinancial[];
  disclosures: { title: string; date: string; url: string }[];
  // DART 사업보고서 "II. 사업의 내용" 파싱 결과 (최대 5000자)
  businessContent: string | null;
}


interface OpenDartCompany {
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

interface OpenDartFinanceItem {
  account_nm: string;
  thstrm_amount: string;
}

interface OpenDartEmployee {
  fo_bbm: string;            // 직원 구분 (사무직·생산직·합계 등)
  sexdstn_code_nm: string;   // 성별 구분 (남자·여자·합계)
  rgllbr_co: string;         // 정규직수
  cnttk_co: string;          // 계약직수
  sm_empNo: string;          // 합계 (정규직+계약직)
  avrg_cnwk_sdytrn: string;  // 평균 근속연수 (단위: 년)
  jan_pd_totamt: string;     // 연간급여총액 (단위: 백만원)
  jan_pd_avramt: string;     // 1인평균급여액 (단위: 백만원)
}

interface OpenDartDisclosure {
  report_nm: string;
  rcept_dt: string;
  rcept_no: string;
}

@Injectable()
export class DartFinancialService {
  private readonly logger = new Logger(DartFinancialService.name);
  private corpCodeCache: { map: Map<string, string>; fetchedAt: number } | null = null;

  constructor(private readonly dartQueue: DartApiQueueService) {}

  async fetchCompanyData(
    companyName: string,
    dartApiKey?: string | null,
  ): Promise<DartFinancialData | null> {
    if (!dartApiKey) return null;

    return this.dartQueue.run(companyName, () => this.doFetch(companyName, dartApiKey));
  }

  private async doFetch(
    companyName: string,
    dartApiKey: string,
  ): Promise<DartFinancialData | null> {
    try {
      const corpCode = await this.findCorpCode(companyName, dartApiKey);
      if (!corpCode) {
        this.logger.warn(`[DART] "${companyName}" 기업 코드 조회 실패`);
        return null;
      }

      const [companyRes, disclosuresRes, multiYearRes, employeeHistoryRes] = await Promise.allSettled([
        this.fetchCompanyInfo(corpCode, dartApiKey),
        this.fetchDisclosures(corpCode, dartApiKey),
        this.fetchMultiYearFinancials(corpCode, dartApiKey),
        this.fetchEmployeeHistory(corpCode, dartApiKey),
      ]);

      if (companyRes.status === 'rejected') this.logger.error(`[DART] 기업정보 오류: ${companyRes.reason}`);
      if (disclosuresRes.status === 'rejected') this.logger.error(`[DART] 공시 오류: ${disclosuresRes.reason}`);
      if (multiYearRes.status === 'rejected') this.logger.error(`[DART] 재무 오류: ${multiYearRes.reason}`);

      const company = companyRes.status === 'fulfilled' ? companyRes.value : null;
      const { list: disclosures, latestAnnualRceptNo } =
        disclosuresRes.status === 'fulfilled'
          ? disclosuresRes.value
          : { list: [], latestAnnualRceptNo: null };
      const { financials: multiYearFinancials, latestCapital } =
        multiYearRes.status === 'fulfilled' ? multiYearRes.value : { financials: [], latestCapital: null };
      const employeeHistory = employeeHistoryRes.status === 'fulfilled' ? (employeeHistoryRes.value ?? []) : [];
      const latestEmp = employeeHistory.at(-1) ?? null;
      const employees = latestEmp ? `${(latestEmp.total ?? 0).toLocaleString()}명` : null;

      const latest = multiYearFinancials.at(-1) ?? null;

      // 사업보고서 "II. 사업의 내용" 파싱 (순차 실행 — rcept_no 필요)
      let businessContent: string | null = null;
      if (latestAnnualRceptNo) {
        businessContent = await this.fetchAnnualReportSections(latestAnnualRceptNo);
      }

      return {
        companyName,
        corpCode,
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
        dartUrl: `https://dart.fss.or.kr/corp/searchCorpInfo.do?corp_code=${corpCode}`,
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
      this.logger.error(`[DART] 최상위 오류: ${(err as Error).message}\n${(err as Error).stack}`);
      return null;
    }
  }

  // ── 기업코드 조회 (corpCode.xml ZIP 다운로드 후 로컬 검색) ────────────

  private async findCorpCode(companyName: string, apiKey: string): Promise<string | null> {
    const map = await this.getCorpCodeMap(apiKey);
    if (!map.size) return null;

    // 1. 정확히 일치
    if (map.has(companyName)) return map.get(companyName)!;

    // 2. 정규화 후 일치 — (주)/㈜/공백/특수문자 제거
    const norm = (s: string) => s.replace(/[\s(주)㈜()（）]/g, '').toLowerCase();
    const target = norm(companyName);
    for (const [name, code] of map) {
      if (norm(name) === target) return code;
    }

    // 3. 접두사 일치 (예: "삼성전자" → "삼성전자주식회사")
    const prefixMatches: string[] = [];
    for (const [name, code] of map) {
      if (name.startsWith(companyName) || companyName.startsWith(name)) {
        prefixMatches.push(`"${name}"(${code})`);
        if (prefixMatches.length === 1) return code;
      }
    }

    this.logger.warn(`[DART] "${companyName}" 기업코드 미발견. 접두사 후보: ${prefixMatches.slice(0, 5).join(', ')}`);
    return null;
  }

  private async getCorpCodeMap(apiKey: string): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.corpCodeCache && now - this.corpCodeCache.fetchedAt < CORP_CACHE_TTL_MS) {
      return this.corpCodeCache.map;
    }

    const map = new Map<string, string>();
    try {
      const url = `${OPEN_DART_BASE}/corpCode.xml?crtfc_key=${apiKey}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ResearchAI/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`[DART] corpCode.xml 다운로드 실패 — body: ${body.slice(0, 300)}`);
        return map;
      }

      const zipBuf = Buffer.from(await res.arrayBuffer());

      const xml = await this.extractXmlFromZip(zipBuf);
      if (!xml) {
        this.logger.error('[DART] ZIP 파싱 실패 — compression 방식 미지원 또는 헤더 오류');
        return map;
      }

      // <list><corp_code>00000000</corp_code><corp_name>회사명</corp_name>...</list>
      const re = /<list>[\s\S]*?<corp_code>(\d+)<\/corp_code>[\s\S]*?<corp_name>([^<]+)<\/corp_name>[\s\S]*?<\/list>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        map.set(m[2].trim(), m[1].trim());
      }
    } catch (err) {
      this.logger.error(`[DART] corpCode.xml 오류: ${(err as Error).message}\n${(err as Error).stack}`);
    }

    this.corpCodeCache = { map, fetchedAt: Date.now() };
    return map;
  }

  private async extractXmlFromZip(zipBuf: Buffer): Promise<string | null> {
    // ── 1. EOCD(End of Central Directory) 탐색 — 파일 끝에서 역방향 ────
    // Central Directory에 compressedSz가 정확히 기록됨 (로컬 헤더는 0일 수 있음)
    let eocdOffset = -1;
    for (let i = zipBuf.length - 22; i >= 0; i--) {
      if (zipBuf.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
    }
    if (eocdOffset === -1) {
      this.logger.error('[DART] EOCD 서명 없음');
      return null;
    }
    const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

    // ── 2. 첫 Central Directory 엔트리에서 정확한 크기 읽기 ────────────
    if (zipBuf.readUInt32LE(cdOffset) !== 0x02014b50) {
      this.logger.error('[DART] CD 서명 불일치');
      return null;
    }
    const compression    = zipBuf.readUInt16LE(cdOffset + 10);
    const compressedSz   = zipBuf.readUInt32LE(cdOffset + 20);
    const localHdrOffset = zipBuf.readUInt32LE(cdOffset + 42);

    // ── 3. 로컬 헤더에서 데이터 시작 위치 계산 (크기는 CD 값 사용) ────
    if (zipBuf.readUInt32LE(localHdrOffset) !== 0x04034b50) {
      this.logger.error('[DART] 로컬 파일 헤더 서명 불일치');
      return null;
    }
    const fileNameLen = zipBuf.readUInt16LE(localHdrOffset + 26);
    const extraLen    = zipBuf.readUInt16LE(localHdrOffset + 28);
    const dataStart   = localHdrOffset + 30 + fileNameLen + extraLen;
    const compressed  = zipBuf.subarray(dataStart, dataStart + compressedSz);

    if (compression === 0) return compressed.toString('utf-8');
    if (compression === 8) {
      const raw = await inflateRawAsync(compressed);
      return raw.toString('utf-8');
    }
    this.logger.error(`[DART] 미지원 compression: ${compression}`);
    return null;
  }

  private async fetchCompanyInfo(corpCode: string, apiKey: string): Promise<OpenDartCompany | null> {
    const url = `${OPEN_DART_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
    const res = await this.dartFetch<{ status: string; message?: string } & OpenDartCompany>(url);
    return res?.status === '000' ? res : null;
  }

  private async fetchDisclosures(
    corpCode: string,
    apiKey: string,
  ): Promise<{ list: { title: string; date: string; url: string }[]; latestAnnualRceptNo: string | null }> {
    const bgn = this.dateYearsAgo(2);
    const url = `${OPEN_DART_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bgn_de=${bgn}&pblntf_ty=A&sort=date&page_count=10`;
    const res = await this.dartFetch<{ status: string; message?: string; list?: OpenDartDisclosure[] }>(url);
    if (!res || res.status !== '000' || !res.list) return { list: [], latestAnnualRceptNo: null };
    const latestAnnual = res.list.find((d) => d.report_nm.includes('사업보고서'));
    return {
      list: res.list.map((d) => ({
        title: d.report_nm,
        date: this.fmtDate(d.rcept_dt),
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,
      })),
      latestAnnualRceptNo: latestAnnual?.rcept_no ?? null,
    };
  }

  private async fetchMultiYearFinancials(
    corpCode: string,
    apiKey: string,
  ): Promise<{ financials: YearlyFinancial[]; latestCapital: string | null }> {
    const currentYear = new Date().getFullYear();
    const results: YearlyFinancial[] = [];
    let latestCapital: string | null = null;

    const yearRange = [currentYear - 3, currentYear - 2, currentYear - 1];
    const responses = await Promise.allSettled(
      yearRange.map((year) => {
        const url = `${OPEN_DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${ANNUAL_REPORT_CODE}`;
        return this.dartFetch<{ status: string; message?: string; list?: OpenDartFinanceItem[] }>(url).then((r) => ({ year, r }));
      }),
    );

    for (const settled of responses) {
      if (settled.status !== 'fulfilled') continue;
      const { year, r } = settled.value;
      if (!r || r.status !== '000' || !r.list?.length) continue;

      const find = (names: string[]) =>
        r.list!.find((item) => names.some((n) => item.account_nm.includes(n)))?.thstrm_amount ?? null;

      const revenueRaw           = find(['매출액', '수익(매출액)']);
      const opRaw                = find(['영업이익', '영업손익']);
      const niRaw                = find(['당기순이익', '당기순손익']);
      const capitalRaw           = find(['자본금']);
      const totalAssetsRaw       = find(['자산총계']);
      const totalLiabilitiesRaw  = find(['부채총계']);
      const totalEquityRaw       = find(['자본총계']);
      const currentAssetsRaw     = find(['유동자산']);
      const currentLiabRaw       = find(['유동부채']);
      const opCashRaw            = find(['영업활동으로 인한 현금흐름', '영업활동현금흐름', '영업활동으로인한현금흐름']);
      const invCashRaw           = find(['투자활동으로 인한 현금흐름', '투자활동현금흐름', '투자활동으로인한현금흐름']);
      const finCashRaw           = find(['재무활동으로 인한 현금흐름', '재무활동현금흐름', '재무활동으로인한현금흐름']);

      const toEok = (raw: string | null) => {
        if (!raw) return null;
        const n = parseInt(raw.replace(/,/g, ''), 10);
        return isNaN(n) ? null : Math.round(n / 100_000_000);
      };

      const revenue           = toEok(revenueRaw);
      const operatingProfit   = toEok(opRaw);
      const netIncome         = toEok(niRaw);
      const totalAssets       = toEok(totalAssetsRaw);
      const totalLiabilities  = toEok(totalLiabilitiesRaw);
      const totalEquity       = toEok(totalEquityRaw);
      const currentAssets     = toEok(currentAssetsRaw);
      const currentLiabilities = toEok(currentLiabRaw);
      const capitalAmount     = toEok(capitalRaw);

      const pct = (a: number | null, b: number | null) =>
        a != null && b != null && b !== 0 ? Math.round((a / b) * 1000) / 10 : null;

      const operatingMargin   = pct(operatingProfit, revenue);
      const netIncomeMargin   = pct(netIncome, revenue);
      const debtRatio         = pct(totalLiabilities, totalEquity);
      const currentRatio      = pct(currentAssets, currentLiabilities);

      // 가장 최신 연도의 자본금 저장
      if (capitalRaw) latestCapital = this.fmtAmount(capitalRaw);

      results.push({
        year,
        revenue,
        revenueFormatted: revenueRaw ? this.fmtAmount(revenueRaw) : null,
        operatingProfit,
        operatingProfitFormatted: opRaw ? this.fmtAmount(opRaw) : null,
        netIncome,
        netIncomeFormatted: niRaw ? this.fmtAmount(niRaw) : null,
        operatingMargin,
        netIncomeMargin,
        totalAssets,
        totalLiabilities,
        totalEquity,
        capitalAmount,
        currentAssets,
        currentLiabilities,
        debtRatio,
        currentRatio,
        operatingCashFlow:  toEok(opCashRaw),
        investingCashFlow:  toEok(invCashRaw),
        financingCashFlow:  toEok(finCashRaw),
      });
    }

    return { financials: results.sort((a, b) => a.year - b.year), latestCapital };
  }

  private async fetchEmployeeHistory(corpCode: string, apiKey: string): Promise<EmployeeDetail[]> {
    const latestYear = new Date().getFullYear() - 1;
    const years = [latestYear - 1, latestYear];
    const settled = await Promise.allSettled(
      years.map((y) => this.fetchEmployeeForYear(corpCode, apiKey, y)),
    );
    const results = settled
      .filter((r): r is PromiseFulfilledResult<EmployeeDetail | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((v): v is EmployeeDetail => v != null);
    // 데이터가 없으면 더 이전 연도 시도
    if (!results.length) {
      const older = await this.fetchEmployeeForYear(corpCode, apiKey, latestYear - 2);
      if (older) results.push(older);
    }
    return results.sort((a, b) => a.year - b.year);
  }

  private async fetchEmployeeForYear(corpCode: string, apiKey: string, year: number): Promise<EmployeeDetail | null> {
    const url = `${OPEN_DART_BASE}/empSttus.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${ANNUAL_REPORT_CODE}`;
    const res = await this.dartFetch<{ status: string; list?: OpenDartEmployee[] }>(url);

    if (!res || res.status !== '000' || !res.list?.length) {
      return null;
    }

    const toNum = (s: string | undefined) => {
      const n = parseInt((s ?? '').replace(/,/g, ''), 10);
      return isNaN(n) || n < 0 ? null : n;
    };
    const toTenure = (s: string | undefined) => {
      const n = parseFloat((s ?? '').replace(/,/g, ''));
      return isNaN(n) || n <= 0 ? null : `${n}년`;
    };
    const toSalary = (s: string | undefined) => {
      // jan_pd_avramt 단위: 백만원
      const n = parseInt((s ?? '').replace(/,/g, ''), 10);
      if (isNaN(n) || n <= 0) return null;
      return n >= 10000
        ? `${(n / 10000).toFixed(1)}억원`
        : `${(n / 10).toFixed(0)}만원`;   // 백만원 → 만원 표기
    };

    const rows = res.list;

    // 전체 합계 행: fo_bbm 합계 & sexdstn_code_nm 합계
    const totalRow = rows.find(
      (r) => r.fo_bbm?.includes('합계') && (r.sexdstn_code_nm?.includes('합계') || !r.sexdstn_code_nm),
    ) ?? rows.find((r) => r.fo_bbm?.includes('합계')) ?? rows[0];

    // 남/여 합계 행
    const maleRow = rows.find(
      (r) => r.fo_bbm?.includes('합계') && r.sexdstn_code_nm?.includes('남'),
    );
    const femaleRow = rows.find(
      (r) => r.fo_bbm?.includes('합계') && r.sexdstn_code_nm?.includes('여'),
    );

    const total = toNum(totalRow?.sm_empNo);
    if (!total) return null;

    const regular = toNum(totalRow?.rgllbr_co);
    const contract = toNum(totalRow?.cnttk_co);

    return {
      year,
      total,
      regular,
      contract,
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

  // ── DART 사업보고서 HTML 파싱 ──────────────────────────────────────────

  async fetchAnnualReportSections(rceptNo: string): Promise<string | null> {
    try {
      // 1. 메인 뷰어 frameset → TOC frame src 추출
      const mainHtml = await this.fetchHtml(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`);
      if (!mainHtml) { this.logger.error('[DART] 사업보고서 메인 뷰어 접근 실패'); return null; }

      const frameSrcs = [...mainHtml.matchAll(/src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
      const tocSrc = frameSrcs.find((s) => /toc/i.test(s));
      if (!tocSrc) { this.logger.error('[DART] TOC frame 미발견'); return null; }

      const tocUrl = tocSrc.startsWith('http') ? tocSrc : `https://dart.fss.or.kr${tocSrc}`;

      // 2. TOC → "사업의 내용" 섹션 URL
      const tocHtml = await this.fetchHtml(tocUrl);
      if (!tocHtml) { this.logger.error('[DART] TOC 접근 실패'); return null; }

      const sectionUrl = this.findSectionUrl(tocHtml);
      if (!sectionUrl) { this.logger.error('[DART] 사업의 내용 링크 미발견'); return null; }

      // 3. 섹션 본문 HTML
      const contentHtml = await this.fetchHtml(sectionUrl);
      if (!contentHtml) return null;

      // 4. 테이블(사업부문·매출비중) + 본문 텍스트 추출 — 토큰 절약을 위해 제한
      const tables = this.extractTables(contentHtml);
      const plainText = this.stripHtml(contentHtml);

      const parts: string[] = [];
      if (tables.trim()) parts.push(`[사업부문 테이블]\n${tables.slice(0, 2500)}`);
      if (plainText.trim()) parts.push(`[사업 내용]\n${plainText.slice(0, 2500)}`);

      return parts.join('\n\n').slice(0, 5000) || null;
    } catch (err) {
      this.logger.error(`[DART] 사업보고서 파싱 오류: ${(err as Error).message}`);
      return null;
    }
  }

  private findSectionUrl(tocHtml: string): string | null {
    // "사업의 내용" 텍스트 기준으로 앞쪽 ~800자에서 goPage/href URL 추출
    const idx = tocHtml.search(/사업의\s*내용/);
    if (idx === -1) return null;
    const window = tocHtml.slice(Math.max(0, idx - 800), idx + 200);

    // goPage('/report/viewer.do?...') 패턴
    const goPageMatch = window.match(/goPage\(['"]([^'"]+)['"]/);
    if (goPageMatch) {
      const u = goPageMatch[1];
      return u.startsWith('http') ? u : `https://dart.fss.or.kr${u}`;
    }
    // <a href="/report/viewer.do?..."> 패턴
    const hrefMatch = window.match(/href\s*=\s*["']([^"']*viewer[^"']*)["']/i);
    if (hrefMatch) {
      const u = hrefMatch[1];
      return u.startsWith('http') ? u : `https://dart.fss.or.kr${u}`;
    }
    return null;
  }

  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://dart.fss.or.kr/',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { this.logger.error(`[DART] HTTP ${res.status} — ${url}`); return null; }
      return await res.text();
    } catch (err) {
      this.logger.error(`[DART] fetchHtml 오류 — ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractTables(html: string): string {
    const results: string[] = [];
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tblMatch: RegExpExecArray | null;
    while ((tblMatch = tableRe.exec(html)) !== null) {
      const rows: string[] = [];
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(tblMatch[0])) !== null) {
        const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRe.exec(rowMatch[0])) !== null) {
          const text = this.stripHtml(cellMatch[1]).slice(0, 80);
          if (text) cells.push(text);
        }
        if (cells.length >= 2) rows.push(cells.join(' | '));
      }
      if (rows.length >= 2) results.push(rows.join('\n'));
    }
    return results.join('\n\n');
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
      const json = await res.json() as T;
      return json;
    } catch (err) {
      this.logger.error(`[DART] fetch 오류 — ${shortUrl}: ${(err as Error).message}`);
      return null;
    }
  }

  private fmtAmount(raw: string): string {
    const n = parseInt(raw.replace(/,/g, ''), 10);
    if (isNaN(n)) return raw;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조 원`;
    if (abs >= 100_000_000) return `${sign}${Math.round(abs / 100_000_000).toLocaleString()}억 원`;
    if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString()}만 원`;
    return `${n.toLocaleString()} 원`;
  }

  private fmtDate(raw: string): string {
    if (raw.length === 8) return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
    return raw;
  }

  private dateYearsAgo(n: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  corpClassLabel(cls: string | null): string {
    const map: Record<string, string> = { Y: '유가증권(KOSPI)', K: '코스닥(KOSDAQ)', N: '코넥스', E: '비상장' };
    return cls ? (map[cls] ?? cls) : '비상장';
  }

  formatForAnalysis(data: DartFinancialData): string {
    const lines: string[] = [`## DART 재무 데이터: ${data.companyName}`];
    if (data.fiscalYear) lines.push(`- 회계연도: ${data.fiscalYear}`);
    if (data.corpClass) lines.push(`- 상장: ${this.corpClassLabel(data.corpClass)}`);
    if (data.ceoName) lines.push(`- 대표이사: ${data.ceoName}`);
    if (data.foundedDate) lines.push(`- 설립일: ${this.fmtDate(data.foundedDate)}`);
    if (data.revenue) lines.push(`- 매출액: ${data.revenue}`);
    if (data.operatingProfit) lines.push(`- 영업이익: ${data.operatingProfit}`);
    if (data.netIncome) lines.push(`- 당기순이익: ${data.netIncome}`);

    if (data.employeeHistory?.length) {
      for (const e of data.employeeHistory) {
        lines.push(`\n### 직원 현황 (${e.year}년 DART)`);
        if (e.total != null) lines.push(`- 총 직원수: ${e.total.toLocaleString()}명`);
        if (e.regular != null && e.contract != null && e.total) {
          const rPct = Math.round((e.regular / e.total) * 100);
          lines.push(`- 근무형태: 정규직 ${e.regular.toLocaleString()}명(${rPct}%), 계약직 ${e.contract.toLocaleString()}명(${100 - rPct}%)`);
        }
        if (e.maleCount != null && e.femaleCount != null && e.total) {
          const mPct = Math.round((e.maleCount / e.total) * 100);
          lines.push(`- 성별: 남성 ${e.maleCount.toLocaleString()}명(${mPct}%), 여성 ${e.femaleCount.toLocaleString()}명(${100 - mPct}%)`);
        }
        if (e.avgTenure) lines.push(`- 평균 근속연수: ${e.avgTenure} (남성 ${e.maleTenure ?? '—'} / 여성 ${e.femaleTenure ?? '—'})`);
        if (e.avgSalary) lines.push(`- 1인 평균급여: ${e.avgSalary} (남성 ${e.maleSalary ?? '—'} / 여성 ${e.femaleSalary ?? '—'})`);
      }
    }

    if (data.businessContent) {
      lines.push('\n### DART 사업보고서 — 사업의 내용 (II)');
      lines.push(data.businessContent);
    }

    if (data.disclosures.length > 0) {
      lines.push('\n### 최근 공시');
      data.disclosures.slice(0, 5).forEach((d) => lines.push(`- [${d.date}] ${d.title}`));
    }
    return lines.join('\n');
  }
}
