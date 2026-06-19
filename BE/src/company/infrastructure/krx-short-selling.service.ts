import { Injectable, Logger } from '@nestjs/common';
import { KrxInvestorService } from 'src/company/infrastructure/krx-investor.service';

export interface ShortSellingRecord {
  date: string;
  shortVolume: number | null;
  uptickRuleVolume: number | null;
  uptickRuleExemptVolume: number | null;
  balanceVolume: number | null;
  shortAmount: number | null;
  balanceAmount: number | null;
}

export interface ShortSellingData {
  stockCode: string | null;
  records: ShortSellingRecord[];
  source: string;
  error?: string;
}

@Injectable()
export class KrxShortSellingService {
  private readonly logger = new Logger(KrxShortSellingService.name);

  constructor(private readonly krxInvestor: KrxInvestorService) {}

  async fetchShortSelling(
    stockCode: string,
    days = 90,
  ): Promise<ShortSellingData> {
    const normalizedDays =
      Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 190) : 90;
    const isin = this.krxInvestor.stockCodeToIsin(stockCode);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - normalizedDays * 2);
    const fmt = (date: Date) =>
      date.toISOString().slice(0, 10).replace(/-/g, '');

    const params = new URLSearchParams({
      bld: 'dbms/MDC_OUT/STAT/srt/MDCSTAT30001_OUT',
      locale: 'ko_KR',
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
            Referer: `https://data.krx.co.kr/comm/srt/srtLoader/index.cmd?screenId=MDCSTAT300&isuCd=${stockCode}`,
            Origin: 'https://data.krx.co.kr',
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: params.toString(),
          signal: AbortSignal.timeout(12000),
        },
      );

      if (!res.ok) {
        this.logger.warn(`[KRX ShortSelling] HTTP ${res.status} for ${isin}`);
        return {
          stockCode,
          records: [],
          source: 'KRX',
          error: `HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as {
        OutBlock_1?: Record<string, string>[];
      };
      const rows = data.OutBlock_1 ?? [];
      const records = rows
        .map((row) => ({
          date: this.normalizeDate(row.TRD_DD),
          shortVolume: this.parseNum(row.CVSRTSELL_TRDVOL),
          uptickRuleVolume: this.parseNum(row.UPTICKRULE_APPL_TRDVOL),
          uptickRuleExemptVolume: this.parseNum(row.UPTICKRULE_EXCPT_TRDVOL),
          balanceVolume: this.parseNum(row.STR_CONST_VAL1),
          shortAmount: this.parseNum(row.CVSRTSELL_TRDVAL),
          balanceAmount: this.parseNum(row.STR_CONST_VAL2),
        }))
        .filter((record) => record.date)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, normalizedDays);

      return {
        stockCode,
        records,
        source: 'KRX',
        error: records.length ? undefined : '데이터 없음',
      };
    } catch (error) {
      this.logger.warn(
        `[KRX ShortSelling] fetch 오류 for ${isin}: ${(error as Error).message}`,
      );
      return {
        stockCode,
        records: [],
        source: 'KRX',
        error: (error as Error).message,
      };
    }
  }

  private normalizeDate(value?: string) {
    if (!value) return '';
    const compact = value.replace(/\D/g, '');
    if (compact.length !== 8) return value;
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }

  private parseNum(value?: string | number | null): number | null {
    if (value == null || value === '-') return null;
    if (typeof value === 'number') return value;
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
}
