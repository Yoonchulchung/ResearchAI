import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import {
  LandComplex,
  LandOverview,
  LandRegion,
  LandSummary,
} from 'src/financial/domain/land/land.types';

const SEOUL_CITY_NAME = '서울특별시';
const NAVER_REAL_ESTATE_TYPES = 'APT:PRE:ABYG:JGC';

const DISTRICT_CORTAR: Record<string, string> = {
  종로구: '1111000000',
  중구: '1114000000',
  용산구: '1117000000',
  성동구: '1120000000',
  광진구: '1121500000',
  동대문구: '1123000000',
  중랑구: '1126000000',
  성북구: '1129000000',
  강북구: '1130500000',
  도봉구: '1132000000',
  노원구: '1135000000',
  은평구: '1138000000',
  서대문구: '1141000000',
  마포구: '1144000000',
  양천구: '1147000000',
  강서구: '1150000000',
  구로구: '1153000000',
  금천구: '1154500000',
  영등포구: '1156000000',
  동작구: '1159000000',
  관악구: '1162000000',
  서초구: '1165000000',
  강남구: '1168000000',
  송파구: '1171000000',
  강동구: '1174000000',
};

const EXTRA_REGIONS: Record<string, LandRegion> = {
  '경기도 성남시': {
    label: '경기도 성남시',
    key: '성남시',
    cortarNo: '4113000000',
  },
  '경기도 과천시': {
    label: '경기도 과천시',
    key: '과천시',
    cortarNo: '4129000000',
  },
  '경기도 하남시': {
    label: '경기도 하남시',
    key: '하남시',
    cortarNo: '4145000000',
  },
  '경기도 수원시': {
    label: '경기도 수원시',
    key: '수원시',
    cortarNo: '4111000000',
  },
  '경기도 용인시': {
    label: '경기도 용인시',
    key: '용인시',
    cortarNo: '4146000000',
  },
  '경기도 고양시': {
    label: '경기도 고양시',
    key: '고양시',
    cortarNo: '4128000000',
  },
  '인천광역시 연수구': {
    label: '인천광역시 연수구',
    key: '연수구',
    cortarNo: '2818500000',
  },
  '부산광역시 해운대구': {
    label: '부산광역시 해운대구',
    key: '해운대구',
    cortarNo: '2635000000',
  },
};

const NAVER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://new.land.naver.com/',
};

@Injectable()
export class NaverLandAdapter {
  private readonly logger = new Logger(NaverLandAdapter.name);

  resolveRegion(input: string): LandRegion {
    const label = this.extractDistrict(input) ?? input.trim();
    const exact = this.getKnownRegion(label);
    if (exact) return exact;

    const local =
      label.match(/([가-힣]{2,8}(?:구|시|군))/)?.[1] ?? label.trim();
    if (DISTRICT_CORTAR[local]) {
      return {
        label: `${SEOUL_CITY_NAME} ${local}`,
        key: local,
        cortarNo: DISTRICT_CORTAR[local],
      };
    }

    return {
      label: label || '서울특별시 강남구',
      key: local || '강남구',
      cortarNo: null,
    };
  }

  buildNaverLandUrl(region: LandRegion): string {
    if (!region.cortarNo) {
      return `https://new.land.naver.com/search?query=${encodeURIComponent(region.label)}`;
    }
    return `https://new.land.naver.com/complexes?cortarNo=${region.cortarNo}&a=${NAVER_REAL_ESTATE_TYPES}&e=RETAIL`;
  }

  async fetchOverview(query: string, limit: number): Promise<LandOverview> {
    const region = this.resolveRegion(query);
    const base = this.buildEmptyOverview(query, region, 'unsupported');

    if (!region.cortarNo) {
      return {
        ...base,
        source: {
          provider: 'naver-land',
          status: 'unsupported',
          message:
            '아직 이 지역의 법정동 코드가 등록되지 않아 네이버 부동산 링크만 제공합니다.',
        },
      };
    }

    try {
      const [dealData, leaseData] = await Promise.all([
        this.callComplexMarkersApi(region.cortarNo, 'A1'),
        this.callComplexMarkersApi(region.cortarNo, 'B1'),
      ]);
      const complexes = this.mergeComplexes(
        this.parseComplexes(dealData, 'A1'),
        this.parseComplexes(leaseData, 'B1'),
      ).slice(0, limit);

      return {
        ...base,
        source: {
          provider: 'naver-land',
          status: 'live',
          message:
            '네이버 부동산 내부 응답을 실시간으로 읽었습니다. 공식 Open API가 아니므로 운영 환경에서는 호출량과 약관 확인이 필요합니다.',
        },
        summary: this.buildSummary(complexes),
        complexes,
      };
    } catch (error) {
      this.logger.warn(
        `[Land] Naver direct request failed: ${(error as Error).message}`,
      );
      try {
        const complexes = await this.fetchViaPuppeteer(region, limit);
        if (complexes.length > 0) {
          return {
            ...base,
            source: {
              provider: 'naver-land',
              status: 'live',
              message:
                '네이버 부동산 화면 응답을 브라우저 세션으로 읽었습니다. 공식 Open API가 아니므로 운영 환경에서는 호출량과 약관 확인이 필요합니다.',
            },
            summary: this.buildSummary(complexes),
            complexes,
          };
        }
      } catch (puppeteerError) {
        this.logger.warn(
          `[Land] Naver browser request failed: ${(puppeteerError as Error).message}`,
        );
      }

      return {
        ...base,
        source: {
          provider: 'naver-land',
          status: 'unavailable',
          message:
            '네이버 부동산 응답을 가져오지 못했습니다. 네이버 링크에서 직접 확인할 수 있습니다.',
        },
      };
    }
  }

  private async fetchViaPuppeteer(
    region: LandRegion,
    limit: number,
  ): Promise<LandComplex[]> {
    if (!region.cortarNo) return [];

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    const page = await browser.newPage();
    const dealComplexes: LandComplex[] = [];
    const leaseComplexes: LandComplex[] = [];

    try {
      await page.setUserAgent(NAVER_HEADERS['User-Agent']);
      await page.setExtraHTTPHeaders({
        'Accept-Language': NAVER_HEADERS['Accept-Language'],
      });
      page.on('response', async (response) => {
        const url = response.url();
        if (!url.includes('/api/complexes/single-markers')) return;
        try {
          const json = await response.json();
          const tradeType = url.includes('tradeType=B1') ? 'B1' : 'A1';
          if (tradeType === 'B1') {
            leaseComplexes.push(...this.parseComplexes(json, 'B1'));
          } else {
            dealComplexes.push(...this.parseComplexes(json, 'A1'));
          }
        } catch {}
      });

      await page.goto(this.buildNaverLandUrl(region), {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      const browserResponses = await page.evaluate(async (cortarNo) => {
        const request = async (tradeType: 'A1' | 'B1') => {
          const params = new URLSearchParams({
            cortarNo,
            zoom: '13',
            priceType: 'RETAIL',
            markerId: '',
            markerType: '',
            selectedComplexNo: '',
            selectedComplexBuildingNo: '',
            fakeComplexMarker: '',
            realEstateType: 'APT',
            tradeType,
            tag: '',
            rentPriceMin: '0',
            rentPriceMax: '900000000',
            priceMin: '0',
            priceMax: '900000000',
            areaMin: '0',
            areaMax: '900000000',
            oldBuildYears: '',
            recentlyBuildYears: '',
            minHouseHoldCount: '',
            maxHouseHoldCount: '',
            showArticle: 'false',
            sameAddressGroup: 'false',
            minMaintenanceCost: '',
            maxMaintenanceCost: '',
            directions: '',
          });
          const response = await fetch(
            `/api/complexes/single-markers/2.0?${params}`,
            {
              credentials: 'include',
              headers: { accept: 'application/json, text/plain, */*' },
            },
          );
          if (!response.ok) return null;
          return response.json();
        };
        const [deal, lease] = await Promise.all([request('A1'), request('B1')]);
        return { deal, lease };
      }, region.cortarNo);

      if (browserResponses.deal) {
        dealComplexes.push(...this.parseComplexes(browserResponses.deal, 'A1'));
      }
      if (browserResponses.lease) {
        leaseComplexes.push(
          ...this.parseComplexes(browserResponses.lease, 'B1'),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));

      return this.mergeComplexes(dealComplexes, leaseComplexes).slice(0, limit);
    } finally {
      await browser.close();
    }
  }

  private getKnownRegion(label: string): LandRegion | null {
    if (EXTRA_REGIONS[label]) return EXTRA_REGIONS[label];

    const local = label.match(/([가-힣]{2,8}구)$/)?.[1] ?? null;
    if (local && DISTRICT_CORTAR[local]) {
      return {
        label: `${SEOUL_CITY_NAME} ${local}`,
        key: local,
        cortarNo: DISTRICT_CORTAR[local],
      };
    }
    return null;
  }

  private extractDistrict(address: string): string | null {
    const normalized = address.replace('충첨남도', '충청남도').trim();
    const cityMatch = normalized.match(
      /([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))/,
    );
    const city = cityMatch?.[1] ?? null;
    const afterCity =
      city && cityMatch
        ? normalized.slice((cityMatch.index ?? 0) + city.length)
        : normalized;
    const local = afterCity.match(/([가-힣]{2,8}(?:구|시|군))/)?.[1] ?? null;
    if (!local) return null;
    if (city) return `${city} ${local}`;
    if (DISTRICT_CORTAR[local]) return `${SEOUL_CITY_NAME} ${local}`;
    return local;
  }

  private async callComplexMarkersApi(
    cortarNo: string,
    tradeType: 'A1' | 'B1',
  ): Promise<unknown> {
    const params = new URLSearchParams({
      cortarNo,
      zoom: '13',
      priceType: 'RETAIL',
      markerId: '',
      markerType: '',
      selectedComplexNo: '',
      selectedComplexBuildingNo: '',
      fakeComplexMarker: '',
      realEstateType: 'APT',
      tradeType,
      tag: '',
      rentPriceMin: '0',
      rentPriceMax: '900000000',
      priceMin: '0',
      priceMax: '900000000',
      areaMin: '0',
      areaMax: '900000000',
      oldBuildYears: '',
      recentlyBuildYears: '',
      minHouseHoldCount: '',
      maxHouseHoldCount: '',
      showArticle: 'false',
      sameAddressGroup: 'false',
      minMaintenanceCost: '',
      maxMaintenanceCost: '',
      directions: '',
    });

    const res = await fetch(
      `https://new.land.naver.com/api/complexes/single-markers/2.0?${params}`,
      { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private parseComplexes(data: unknown, tradeType: 'A1' | 'B1'): LandComplex[] {
    return this.collectComplexLikeItems(data)
      .map((value) => {
        const item = value as Record<string, unknown>;
        const complexNo = String(
          item.complexNo ?? item.no ?? item.markerId ?? '',
        );
        const complexName = String(
          item.complexName ?? item.name ?? item.markerLabel ?? '',
        );
        const minDealPrice = this.parsePrice(
          item.minDealPrice ?? item.dealPriceMin,
        );
        const maxDealPrice = this.parsePrice(
          item.maxDealPrice ?? item.dealPriceMax,
        );
        const minLeasePrice = this.parsePrice(
          item.minLeasePrice ?? item.leasePriceMin,
        );
        const maxLeasePrice = this.parsePrice(
          item.maxLeasePrice ?? item.leasePriceMax,
        );
        const dealPrice =
          tradeType === 'A1'
            ? this.pickAveragePrice(
                [
                  item.dealPrice,
                  item.averageDealPrice,
                  item.representativeDealPrice,
                ],
                [minDealPrice, maxDealPrice],
              )
            : null;
        const leasePrice =
          tradeType === 'B1'
            ? this.pickAveragePrice(
                [
                  item.leasePrice,
                  item.averageLeasePrice,
                  item.representativeLeasePrice,
                ],
                [minLeasePrice, maxLeasePrice],
              )
            : null;

        return {
          complexNo,
          complexName: complexName || complexNo,
          dealPrice,
          leasePrice,
          minDealPrice,
          maxDealPrice,
          minLeasePrice,
          maxLeasePrice,
          householdCount: this.parseNumber(
            item.totalHouseHoldCount ?? item.householdCount,
          ),
          buildYear: this.parseNumber(item.buildYear),
          latitude: this.parseNumber(item.latitude ?? item.lat),
          longitude: this.parseNumber(item.longitude ?? item.lng),
          naverUrl: complexNo
            ? `https://new.land.naver.com/complexes/${complexNo}`
            : 'https://new.land.naver.com/',
        };
      })
      .filter((item) => item.complexNo || item.complexName);
  }

  private mergeComplexes(
    dealComplexes: LandComplex[],
    leaseComplexes: LandComplex[],
  ): LandComplex[] {
    const byKey = new Map<string, LandComplex>();
    for (const item of [...dealComplexes, ...leaseComplexes]) {
      const key = item.complexNo || item.complexName;
      const prev = byKey.get(key);
      byKey.set(key, prev ? this.mergeComplex(prev, item) : item);
    }
    return [...byKey.values()].sort((a, b) => {
      const aPrice = a.dealPrice ?? a.leasePrice ?? 0;
      const bPrice = b.dealPrice ?? b.leasePrice ?? 0;
      return bPrice - aPrice;
    });
  }

  private mergeComplex(a: LandComplex, b: LandComplex): LandComplex {
    return {
      ...a,
      dealPrice: a.dealPrice ?? b.dealPrice,
      leasePrice: a.leasePrice ?? b.leasePrice,
      minDealPrice: a.minDealPrice ?? b.minDealPrice,
      maxDealPrice: a.maxDealPrice ?? b.maxDealPrice,
      minLeasePrice: a.minLeasePrice ?? b.minLeasePrice,
      maxLeasePrice: a.maxLeasePrice ?? b.maxLeasePrice,
      householdCount: a.householdCount ?? b.householdCount,
      buildYear: a.buildYear ?? b.buildYear,
      latitude: a.latitude ?? b.latitude,
      longitude: a.longitude ?? b.longitude,
    };
  }

  private collectComplexLikeItems(data: unknown): unknown[] {
    const result: unknown[] = [];
    const visit = (value: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== 'object') return;
      const item = value as Record<string, unknown>;
      if (
        item.complexNo ||
        item.complexName ||
        item.markerId ||
        item.minDealPrice ||
        item.minLeasePrice
      ) {
        result.push(item);
      }
      for (const key of [
        'data',
        'complexList',
        'markerList',
        'markers',
        'list',
      ]) {
        if (item[key]) visit(item[key]);
      }
    };
    visit(data);
    return result;
  }

  private pickAveragePrice(
    candidates: unknown[],
    range: unknown[],
  ): number | null {
    for (const candidate of candidates) {
      const parsed = this.parsePrice(candidate);
      if (parsed) return parsed;
    }
    const prices = range
      .map((candidate) => this.parsePrice(candidate))
      .filter((value): value is number => Boolean(value));
    if (prices.length === 0) return null;
    return Math.round(
      prices.reduce((sum, value) => sum + value, 0) / prices.length,
    );
  }

  private parsePrice(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
    if (typeof value !== 'string') return null;

    const text = value.replace(/,/g, '').trim();
    if (!text || text === '-' || text === '0') return null;

    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);

    const eokMatch = text.match(/(\d+(?:\.\d+)?)\s*억/);
    const manMatch =
      text.match(/억\s*(\d+(?:\.\d+)?)/) ?? text.match(/(\d+(?:\.\d+)?)\s*만/);
    const eok = eokMatch ? Number(eokMatch[1]) * 10000 : 0;
    const man = manMatch ? Number(manMatch[1]) : 0;
    const parsed = eok + man;
    return parsed > 0 ? Math.round(parsed) : null;
  }

  private parseNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private buildSummary(complexes: LandComplex[]): LandSummary {
    const dealPrices = complexes
      .map((item) => item.dealPrice)
      .filter((value): value is number => Boolean(value));
    const leasePrices = complexes
      .map((item) => item.leasePrice)
      .filter((value): value is number => Boolean(value));

    const avg = (values: number[]) =>
      values.length
        ? Math.round(
            values.reduce((sum, value) => sum + value, 0) / values.length,
          )
        : null;
    const min = (values: number[]) =>
      values.length ? Math.min(...values) : null;
    const max = (values: number[]) =>
      values.length ? Math.max(...values) : null;

    return {
      avgDealPrice: avg(dealPrices),
      avgLeasePrice: avg(leasePrices),
      minDealPrice: min(dealPrices),
      maxDealPrice: max(dealPrices),
      minLeasePrice: min(leasePrices),
      maxLeasePrice: max(leasePrices),
      complexCount: complexes.length,
    };
  }

  private buildEmptyOverview(
    query: string,
    region: LandRegion,
    status: 'unsupported' | 'unavailable',
  ): LandOverview {
    return {
      query,
      district: region.label,
      cortarNo: region.cortarNo,
      generatedAt: new Date().toISOString(),
      naverLandUrl: this.buildNaverLandUrl(region),
      source: {
        provider: 'naver-land',
        status,
        message: '',
      },
      summary: {
        avgDealPrice: null,
        avgLeasePrice: null,
        minDealPrice: null,
        maxDealPrice: null,
        minLeasePrice: null,
        maxLeasePrice: null,
        complexCount: 0,
      },
      complexes: [],
    };
  }
}
