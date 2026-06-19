import { Injectable, Logger } from '@nestjs/common';

export interface InvestorTradingRecord {
  date: string; // YYYY-MM-DD
  individual: number | null; // 개인 순매수(주)
  foreign: number | null; // 외국인 순매수(주)
  institutional: number | null; // 기관 순매수(주)
}

export interface InvestorTradingData {
  stockCode: string | null;
  records: InvestorTradingRecord[];
  source: string;
  error?: string;
}

@Injectable()
export class KrxInvestorService {
  private readonly logger = new Logger(KrxInvestorService.name);

  /** 6자리 종목코드 → ISIN (KR7XXXXXXXX) */
  stockCodeToIsin(stockCode: string): string {
    const padded = stockCode.replace(/\D/g, '').padStart(6, '0');
    const base = `KR7${padded}00`;
    const check = this.calcIsinCheckDigit(base);
    return `${base}${check}`;
  }

  private calcIsinCheckDigit(base: string): number {
    let digits = '';
    for (const ch of base.toUpperCase()) {
      if (ch >= 'A' && ch <= 'Z') {
        digits += (ch.charCodeAt(0) - 'A'.charCodeAt(0) + 10).toString();
      } else {
        digits += ch;
      }
    }
    let sum = 0;
    let doubleNext = true;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = parseInt(digits[i], 10);
      if (doubleNext) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      doubleNext = !doubleNext;
    }
    return (10 - (sum % 10)) % 10;
  }

  async fetchInvestorTrading(
    stockCode: string,
    days = 30,
  ): Promise<InvestorTradingData> {
    const isin = this.stockCodeToIsin(stockCode);
    const normalizedDays =
      Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 120) : 30;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - normalizedDays * 2); // 주말 고려해 넉넉히

    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

    const params = new URLSearchParams({
      bld: 'dbms/MDC/STAT/standard/MDCSTAT02303',
      isuCd: isin,
      strtDd: fmt(startDate),
      endDd: fmt(endDate),
      share: '1',
      money: '1',
      csvxls_isNo: 'false',
    });

    try {
      const res = await fetch(
        'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Referer: 'https://data.krx.co.kr',
            Origin: 'https://data.krx.co.kr',
            Accept: 'application/json, text/javascript, */*; q=0.01',
          },
          body: params.toString(),
          signal: AbortSignal.timeout(12000),
        },
      );

      if (!res.ok) {
        this.logger.warn(`[KRX] HTTP ${res.status} for ${isin}`);
        const fallback = await this.fetchNaverInvestorTrading(
          stockCode,
          normalizedDays,
        );
        if (fallback.records.length) return fallback;
        return {
          stockCode,
          records: [],
          source: 'KRX',
          error: `HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as Record<string, any>;
      const parsed = this.parseResponse(stockCode, data, normalizedDays);
      if (parsed.records.length) return parsed;

      const fallback = await this.fetchNaverInvestorTrading(
        stockCode,
        normalizedDays,
      );
      if (fallback.records.length) return fallback;
      return parsed;
    } catch (err) {
      this.logger.warn(
        `[KRX] fetch 오류 for ${isin}: ${(err as Error).message}`,
      );
      const fallback = await this.fetchNaverInvestorTrading(
        stockCode,
        normalizedDays,
      );
      if (fallback.records.length) return fallback;
      return {
        stockCode,
        records: [],
        source: 'KRX',
        error: (err as Error).message,
      };
    }
  }

  private parseResponse(
    stockCode: string,
    data: Record<string, any>,
    days: number,
  ): InvestorTradingData {
    // KRX 응답은 OutBlock_1 또는 output 배열로 옴

    const rows: Record<string, any>[] = data?.OutBlock_1 ?? data?.output ?? [];

    if (!rows.length) {
      this.logger.warn(`[KRX] 빈 응답 for ${stockCode}`);
      return { stockCode, records: [], source: 'KRX', error: '데이터 없음' };
    }

    const byDate = new Map<string, InvestorTradingRecord>();

    for (const row of rows) {
      const rawDate: string = row.TRD_DD ?? row.date ?? '';
      const date =
        rawDate.length === 8
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : rawDate;
      if (!date) continue;

      if (!byDate.has(date)) {
        byDate.set(date, {
          date,
          individual: null,
          foreign: null,
          institutional: null,
        });
      }
      const record = byDate.get(date)!;

      const investorName: string = row.INVST_NM ?? row.INVSTPS_NM ?? '';

      if (investorName) {
        /* 응답이 투자자별 행 형태 */
        const netVol = this.parseNum(
          row.NETBUY_TRDVOL ?? row.NETBUY ?? row.NET_BUY_TRDVOL,
        );
        if (investorName.includes('개인')) record.individual = netVol;
        else if (investorName.includes('외국인')) record.foreign = netVol;
        else if (investorName.includes('기관')) record.institutional = netVol;
      } else {
        /* 응답이 날짜별 1행에 투자자 컬럼 형태 */
        record.individual = this.parseNum(
          row.NETBUY_IT ?? row.PRSN_NETBUY ?? row.INDV_NETBUY,
        );
        record.foreign = this.parseNum(
          row.NETBUY_FRG ?? row.FRG_NETBUY ?? row.FRNG_NETBUY,
        );
        record.institutional = this.parseNum(
          row.NETBUY_INS ?? row.INS_NETBUY ?? row.INST_NETBUY,
        );
      }
    }

    const records = Array.from(byDate.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);

    return { stockCode, records, source: 'KRX' };
  }

  private parseNum(val: string | number | undefined | null): number | null {
    if (val == null) return null;
    if (typeof val === 'number') return val;
    const n = parseInt(val.replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  private async fetchNaverInvestorTrading(
    stockCode: string,
    days: number,
  ): Promise<InvestorTradingData> {
    const code = stockCode.replace(/\D/g, '').padStart(6, '0');
    const pages = Math.max(1, Math.ceil(days / 20));
    const records: InvestorTradingRecord[] = [];

    try {
      for (let page = 1; page <= pages && records.length < days; page += 1) {
        const res = await fetch(
          `https://finance.naver.com/item/frgn.naver?code=${code}&page=${page}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(12000),
          },
        );

        if (!res.ok) {
          this.logger.warn(`[Naver Finance] HTTP ${res.status} for ${code}`);
          break;
        }

        const html = new TextDecoder('euc-kr').decode(await res.arrayBuffer());
        records.push(...this.parseNaverResponse(html));
      }
    } catch (err) {
      this.logger.warn(
        `[Naver Finance] fetch 오류 for ${code}: ${(err as Error).message}`,
      );
    }

    const seen = new Set<string>();
    const unique = records
      .filter((record) => {
        if (seen.has(record.date)) return false;
        seen.add(record.date);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);

    return {
      stockCode,
      records: unique,
      source: 'Naver Finance',
      error: unique.length ? undefined : '데이터 없음',
    };
  }

  private parseNaverResponse(html: string): InvestorTradingRecord[] {
    const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

    return rows.flatMap((row) => {
      const cells = row.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
      if (cells.length < 7) return [];

      const rawDate = this.textContent(cells[0]);
      if (!/^\d{4}\.\d{2}\.\d{2}$/.test(rawDate)) return [];

      return [
        {
          date: rawDate.replace(/\./g, '-'),
          individual: null,
          institutional: this.parseNum(this.textContent(cells[5])),
          foreign: this.parseNum(this.textContent(cells[6])),
        },
      ];
    });
  }

  private textContent(html: string): string {
    return html
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
