import { Injectable, Logger } from '@nestjs/common';
import { inflateRaw } from 'zlib';
import { promisify } from 'util';

const inflateRawAsync = promisify(inflateRaw);

const OPEN_DART_BASE = 'https://opendart.fss.or.kr/api';
const ANNUAL_REPORT_CODE = '11011';
const CORP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

export interface YearlyFinancial {
  year: number;
  revenue: number | null;
  revenueFormatted: string | null;
  operatingProfit: number | null;
  operatingProfitFormatted: string | null;
  netIncome: number | null;
  netIncomeFormatted: string | null;
  operatingMargin: number | null;
}

export interface DartFinancialData {
  companyName: string;
  corpCode: string | null;
  stockCode: string | null;
  corpClass: string | null;      // Y=유가증권 K=코스닥 N=코넥스 E=기타
  ceoName: string | null;
  foundedDate: string | null;
  employees: string | null;
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

interface OpenDartDisclosure {
  report_nm: string;
  rcept_dt: string;
  rcept_no: string;
}

@Injectable()
export class DartFinancialService {
  private readonly logger = new Logger(DartFinancialService.name);
  private corpCodeCache: { map: Map<string, string>; fetchedAt: number } | null = null;

  async fetchCompanyData(
    companyName: string,
    dartApiKey?: string | null,
  ): Promise<DartFinancialData | null> {
    if (!dartApiKey) {
      this.logger.warn('[DART-DBG] API 키 없음 — 스킵');
      return null;
    }
    this.logger.log(`[DART-DBG] fetchCompanyData 시작 — 기업명: "${companyName}", 키: ${dartApiKey.slice(0, 6)}...`);

    try {
      const corpCode = await this.findCorpCode(companyName, dartApiKey);
      if (!corpCode) {
        this.logger.warn(`[DART-DBG] "${companyName}" 기업 코드 조회 실패`);
        return null;
      }
      this.logger.log(`[DART-DBG] 기업코드: ${corpCode}`);

      const [companyRes, disclosuresRes, multiYearRes] = await Promise.allSettled([
        this.fetchCompanyInfo(corpCode, dartApiKey),
        this.fetchDisclosures(corpCode, dartApiKey),
        this.fetchMultiYearFinancials(corpCode, dartApiKey),
      ]);

      if (companyRes.status === 'rejected') this.logger.warn(`[DART-DBG] 기업정보 오류: ${companyRes.reason}`);
      if (disclosuresRes.status === 'rejected') this.logger.warn(`[DART-DBG] 공시 오류: ${disclosuresRes.reason}`);
      if (multiYearRes.status === 'rejected') this.logger.warn(`[DART-DBG] 재무 오류: ${multiYearRes.reason}`);

      const company = companyRes.status === 'fulfilled' ? companyRes.value : null;
      const disclosures = disclosuresRes.status === 'fulfilled' ? disclosuresRes.value : [];
      const multiYearFinancials = multiYearRes.status === 'fulfilled' ? multiYearRes.value : [];

      this.logger.log(`[DART-DBG] 기업정보: ${JSON.stringify(company).slice(0, 200)}`);
      this.logger.log(`[DART-DBG] 공시 수: ${disclosures.length}`);
      this.logger.log(`[DART-DBG] 재무 연도 수: ${multiYearFinancials.length} — ${JSON.stringify(multiYearFinancials)}`);

      const latest = multiYearFinancials.at(-1) ?? null;

      return {
        companyName,
        corpCode,
        stockCode: company?.stock_code || null,
        corpClass: company?.corp_cls || null,
        ceoName: company?.ceo_nm || null,
        foundedDate: company?.est_dt || null,
        employees: null,
        industry: null,
        homeUrl: company?.hm_url?.startsWith('http') ? company.hm_url : null,
        address: company?.adres || null,
        dartUrl: `https://dart.fss.or.kr/corp/searchCorpAll.do?textCrpNm=${encodeURIComponent(companyName)}`,
        fiscalMonth: company?.acc_mt ? `${company.acc_mt}월` : null,
        revenue: latest?.revenueFormatted ?? null,
        operatingProfit: latest?.operatingProfitFormatted ?? null,
        netIncome: latest?.netIncomeFormatted ?? null,
        totalAssets: null,
        totalEquity: null,
        fiscalYear: latest ? `${latest.year}년` : null,
        multiYearFinancials,
        disclosures,
      };
    } catch (err) {
      this.logger.error(`[DART-DBG] 최상위 오류: ${(err as Error).message}\n${(err as Error).stack}`);
      return null;
    }
  }

  // ── 기업코드 조회 (corpCode.xml ZIP 다운로드 후 로컬 검색) ────────────

  private async findCorpCode(companyName: string, apiKey: string): Promise<string | null> {
    const map = await this.getCorpCodeMap(apiKey);
    this.logger.log(`[DART-DBG] corpCodeMap 크기: ${map.size}`);
    if (!map.size) return null;

    // 1. 정확히 일치
    if (map.has(companyName)) {
      this.logger.log(`[DART-DBG] 기업코드 정확일치: "${companyName}"`);
      return map.get(companyName)!;
    }

    // 2. 정규화 후 일치 — (주)/㈜/공백/특수문자 제거
    const norm = (s: string) => s.replace(/[\s(주)㈜()（）]/g, '').toLowerCase();
    const target = norm(companyName);
    for (const [name, code] of map) {
      if (norm(name) === target) {
        this.logger.log(`[DART-DBG] 기업코드 정규화일치: "${name}" → ${code}`);
        return code;
      }
    }

    // 3. 접두사 일치 (예: "삼성전자" → "삼성전자주식회사")
    const prefixMatches: string[] = [];
    for (const [name, code] of map) {
      if (name.startsWith(companyName) || companyName.startsWith(name)) {
        prefixMatches.push(`"${name}"(${code})`);
        if (prefixMatches.length === 1) {
          this.logger.log(`[DART-DBG] 기업코드 접두사일치: "${name}" → ${code}`);
          return code;
        }
      }
    }

    this.logger.warn(`[DART-DBG] "${companyName}" 기업코드 미발견. 접두사 후보: ${prefixMatches.slice(0, 5).join(', ')}`);
    return null;
  }

  private async getCorpCodeMap(apiKey: string): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.corpCodeCache && now - this.corpCodeCache.fetchedAt < CORP_CACHE_TTL_MS) {
      this.logger.log(`[DART-DBG] corpCodeMap 캐시 사용 (${this.corpCodeCache.map.size}개)`);
      return this.corpCodeCache.map;
    }

    this.logger.log('[DART-DBG] corpCode.xml 다운로드 시작');
    const map = new Map<string, string>();
    try {
      const url = `${OPEN_DART_BASE}/corpCode.xml?crtfc_key=${apiKey}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ResearchAI/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      this.logger.log(`[DART-DBG] corpCode.xml HTTP ${res.status} ${res.statusText}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(`[DART-DBG] corpCode.xml 다운로드 실패 — body: ${body.slice(0, 300)}`);
        return map;
      }

      const zipBuf = Buffer.from(await res.arrayBuffer());
      this.logger.log(`[DART-DBG] ZIP 크기: ${zipBuf.length} bytes`);

      const xml = await this.extractXmlFromZip(zipBuf);
      if (!xml) {
        this.logger.warn('[DART-DBG] ZIP 파싱 실패 — compression 방식 미지원 또는 헤더 오류');
        return map;
      }
      this.logger.log(`[DART-DBG] XML 크기: ${xml.length} bytes, 앞 200자: ${xml.slice(0, 200)}`);

      // <list><corp_code>00000000</corp_code><corp_name>회사명</corp_name>...</list>
      const re = /<list>[\s\S]*?<corp_code>(\d+)<\/corp_code>[\s\S]*?<corp_name>([^<]+)<\/corp_name>[\s\S]*?<\/list>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        map.set(m[2].trim(), m[1].trim());
      }

      this.logger.log(`[DART-DBG] 기업코드 파싱 완료 — ${map.size}개`);
    } catch (err) {
      this.logger.warn(`[DART-DBG] corpCode.xml 오류: ${(err as Error).message}\n${(err as Error).stack}`);
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
      this.logger.warn('[DART-DBG] EOCD 서명 없음');
      return null;
    }
    const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
    this.logger.log(`[DART-DBG] EOCD@${eocdOffset}, CD@${cdOffset}`);

    // ── 2. 첫 Central Directory 엔트리에서 정확한 크기 읽기 ────────────
    if (zipBuf.readUInt32LE(cdOffset) !== 0x02014b50) {
      this.logger.warn('[DART-DBG] CD 서명 불일치');
      return null;
    }
    const compression    = zipBuf.readUInt16LE(cdOffset + 10);
    const compressedSz   = zipBuf.readUInt32LE(cdOffset + 20);
    const localHdrOffset = zipBuf.readUInt32LE(cdOffset + 42);
    this.logger.log(`[DART-DBG] CD: compression=${compression}, compressedSz=${compressedSz}, localHdr@${localHdrOffset}`);

    // ── 3. 로컬 헤더에서 데이터 시작 위치 계산 (크기는 CD 값 사용) ────
    if (zipBuf.readUInt32LE(localHdrOffset) !== 0x04034b50) {
      this.logger.warn('[DART-DBG] 로컬 파일 헤더 서명 불일치');
      return null;
    }
    const fileNameLen = zipBuf.readUInt16LE(localHdrOffset + 26);
    const extraLen    = zipBuf.readUInt16LE(localHdrOffset + 28);
    const dataStart   = localHdrOffset + 30 + fileNameLen + extraLen;
    const compressed  = zipBuf.subarray(dataStart, dataStart + compressedSz);
    this.logger.log(`[DART-DBG] dataStart=${dataStart}, sliceLen=${compressed.length}`);

    if (compression === 0) return compressed.toString('utf-8');
    if (compression === 8) {
      const raw = await inflateRawAsync(compressed);
      return raw.toString('utf-8');
    }
    this.logger.warn(`[DART-DBG] 미지원 compression: ${compression}`);
    return null;
  }

  private async fetchCompanyInfo(corpCode: string, apiKey: string): Promise<OpenDartCompany | null> {
    const url = `${OPEN_DART_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
    const res = await this.dartFetch<{ status: string; message?: string } & OpenDartCompany>(url);
    this.logger.log(`[DART-DBG] company.json status=${res?.status} message=${res?.message ?? ''}`);
    return res?.status === '000' ? res : null;
  }

  private async fetchDisclosures(corpCode: string, apiKey: string): Promise<{ title: string; date: string; url: string }[]> {
    const bgn = this.dateYearsAgo(2);
    const url = `${OPEN_DART_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bgn_de=${bgn}&pblntf_ty=A&sort=date&page_count=10`;
    const res = await this.dartFetch<{ status: string; message?: string; list?: OpenDartDisclosure[] }>(url);
    this.logger.log(`[DART-DBG] list.json status=${res?.status} message=${res?.message ?? ''} items=${res?.list?.length ?? 0}`);
    if (!res || res.status !== '000' || !res.list) return [];
    return res.list.map((d) => ({
      title: d.report_nm,
      date: this.fmtDate(d.rcept_dt),
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,
    }));
  }

  private async fetchMultiYearFinancials(corpCode: string, apiKey: string): Promise<YearlyFinancial[]> {
    const currentYear = new Date().getFullYear();
    const results: YearlyFinancial[] = [];

    // 최근 3개년 병렬 조회
    const yearRange = [currentYear - 3, currentYear - 2, currentYear - 1];
    this.logger.log(`[DART-DBG] 재무데이터 조회 연도: ${yearRange.join(', ')}`);
    const responses = await Promise.allSettled(
      yearRange.map((year) => {
        const url = `${OPEN_DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${ANNUAL_REPORT_CODE}`;
        return this.dartFetch<{ status: string; message?: string; list?: OpenDartFinanceItem[] }>(url).then((r) => ({ year, r }));
      }),
    );

    for (const settled of responses) {
      if (settled.status !== 'fulfilled') continue;
      const { year, r } = settled.value;
      this.logger.log(`[DART-DBG] 재무 ${year}년: status=${r?.status} message=${r?.message ?? ''} items=${r?.list?.length ?? 0}`);
      if (!r || r.status !== '000' || !r.list?.length) continue;

      const find = (names: string[]) =>
        r.list!.find((item) => names.some((n) => item.account_nm.includes(n)))?.thstrm_amount ?? null;

      const revenueRaw = find(['매출액', '수익(매출액)']);
      const opRaw = find(['영업이익', '영업손익']);
      const niRaw = find(['당기순이익', '당기순손익']);

      const toEok = (raw: string | null) => {
        if (!raw) return null;
        const n = parseInt(raw.replace(/,/g, ''), 10);
        return isNaN(n) ? null : Math.round(n / 100_000_000);
      };

      const revenue = toEok(revenueRaw);
      const operatingProfit = toEok(opRaw);
      const netIncome = toEok(niRaw);
      const operatingMargin =
        revenue && operatingProfit && revenue !== 0
          ? Math.round((operatingProfit / revenue) * 1000) / 10
          : null;

      results.push({
        year,
        revenue,
        revenueFormatted: revenueRaw ? this.fmtAmount(revenueRaw) : null,
        operatingProfit,
        operatingProfitFormatted: opRaw ? this.fmtAmount(opRaw) : null,
        netIncome,
        netIncomeFormatted: niRaw ? this.fmtAmount(niRaw) : null,
        operatingMargin,
      });
    }

    return results.sort((a, b) => a.year - b.year);
  }

  private async dartFetch<T>(url: string): Promise<T | null> {
    const shortUrl = url.replace(/crtfc_key=[^&]+/, 'crtfc_key=***');
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ResearchAI/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        this.logger.warn(`[DART-DBG] HTTP ${res.status} — ${shortUrl}`);
        return null;
      }
      const json = await res.json() as T;
      return json;
    } catch (err) {
      this.logger.warn(`[DART-DBG] fetch 오류 — ${shortUrl}: ${(err as Error).message}`);
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
    if (data.disclosures.length > 0) {
      lines.push('\n### 최근 공시');
      data.disclosures.slice(0, 5).forEach((d) => lines.push(`- [${d.date}] ${d.title}`));
    }
    return lines.join('\n');
  }
}
