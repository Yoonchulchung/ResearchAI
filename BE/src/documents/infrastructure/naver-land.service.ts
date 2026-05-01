import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';

export interface ApartmentComplex {
  complexNo: string;
  complexName: string;
  dealPrice: number | null;   // 만원
  leasePrice: number | null;  // 만원
  householdCount: number | null;
  buildYear: number | null;
}

export interface ApartmentPriceSummary {
  district: string;
  avgDealPrice: number | null;
  avgLeasePrice: number | null;
  minDealPrice: number | null;
  maxDealPrice: number | null;
  minLeasePrice: number | null;
  maxLeasePrice: number | null;
  complexCount: number;
  naverLandUrl: string;
}

const SEOUL_CITY_NAME = '서울특별시';
const NAVER_REAL_ESTATE_TYPES = 'APT:PRE:ABYG:JGC';
const MAX_COMPLEXES_FOR_ARTICLES = 30;
const MAX_ARTICLE_PAGES = 3;

interface RegionInfo {
  label: string;
  key: string;
  cortarNo: string | null;
  ms: string | null;
}

const REGION_INFO: Record<string, RegionInfo> = {
  '서울특별시 서초구': {
    label: '서울특별시 서초구',
    key: '서초구',
    cortarNo: '1165000000',
    ms: '2ADmFG,3zn0zk,16',
  },
  '충청남도 서산시': {
    label: '충청남도 서산시',
    key: '서산시',
    cortarNo: '4421000000',
    ms: '2Affs4,3yVwmc,16',
  },
};

// 서울 25개 구 법정동 코드
const DISTRICT_CORTAR: Record<string, string> = {
  '종로구': '1111000000', '중구': '1114000000', '용산구': '1117000000',
  '성동구': '1120000000', '광진구': '1121500000', '동대문구': '1123000000',
  '중랑구': '1126000000', '성북구': '1129000000', '강북구': '1130500000',
  '도봉구': '1132000000', '노원구': '1135000000', '은평구': '1138000000',
  '서대문구': '1141000000', '마포구': '1144000000', '양천구': '1147000000',
  '강서구': '1150000000', '구로구': '1153000000', '금천구': '1154500000',
  '영등포구': '1156000000', '동작구': '1159000000', '관악구': '1162000000',
  '서초구': '1165000000', '강남구': '1168000000', '송파구': '1171000000',
  '강동구': '1174000000',
};

for (const [district, cortarNo] of Object.entries(DISTRICT_CORTAR)) {
  REGION_INFO[`${SEOUL_CITY_NAME} ${district}`] ??= {
    label: `${SEOUL_CITY_NAME} ${district}`,
    key: district,
    cortarNo,
    ms: null,
  };
}

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://new.land.naver.com/',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

@Injectable()
export class NaverLandService {
  private readonly logger = new Logger(NaverLandService.name);

  /** 주소에서 시/도 + 시/군/구까지만 추출 */
  extractDistrict(address: string): string | null {
    const normalizedAddress = address.replace('충첨남도', '충청남도');
    const cityMatch = normalizedAddress.match(/([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))/);
    const cityPart = cityMatch?.[1] ?? null;
    const addressAfterCity = cityPart ? normalizedAddress.slice((cityMatch?.index ?? 0) + cityPart.length) : normalizedAddress;
    const localMatch = addressAfterCity.match(/([가-힣]{2,5}(?:구|시|군))/);
    const local = localMatch?.[1];
    if (!local) return null;

    const city = cityPart ?? (DISTRICT_CORTAR[local] ? SEOUL_CITY_NAME : null);
    return city ? `${city} ${local}` : local;
  }

  /** 주소에서 구 이름만 추출 */
  private extractDistrictName(address: string): string | null {
    if (!address) return null;
    const match = address.match(/([가-힣]{2,5}구)/);
    return match?.[1] ?? null;
  }

  /** cortarNo 조회 */
  getCortarNo(district: string): string | null {
    const region = this.resolveRegion(district);
    return region?.cortarNo ?? null;
  }

  /** 구 이름으로 Naver Land URL 생성 */
  buildNaverLandUrl(district: string): string {
    const region = this.resolveRegion(district);
    if (!region) return 'https://new.land.naver.com/';
    if (region.ms) return this.buildComplexesUrl(region);
    if (region.cortarNo) return this.buildComplexesUrl(region);
    return `https://new.land.naver.com/search?query=${encodeURIComponent(region.label)}`;
  }

  /** 핵심: cortarNo로 아파트 단지 가격 조회 */
  async fetchDistrictPrices(address: string): Promise<ApartmentPriceSummary | null> {
    const district = this.extractDistrict(address);
    if (!district) {
      this.logger.debug(`[NaverLand] 주소에서 구 추출 실패: ${address}`);
      return null;
    }
    const region = this.resolveRegion(district);
    if (!region) {
      this.logger.debug(`[NaverLand] 지역 정보 없음: ${district}`);
      return null;
    }

    if (region.cortarNo) {
      try {
        // 1차 시도: 직접 API 호출 (puppeteer 없이)
        const result = await this.fetchViaApi(region);
        if (result) return result;
      } catch (err) {
        this.logger.warn(`[NaverLand] API 호출 실패, Puppeteer 시도: ${(err as Error).message}`);
      }
    }

    try {
      // 2차 시도: Puppeteer 인터셉트
      return await this.fetchViaPuppeteer(region);
    } catch (err) {
      this.logger.warn(`[NaverLand] Puppeteer 실패: ${(err as Error).message}`);
      return null;
    }
  }

  private resolveRegion(input: string): RegionInfo | null {
    const label = this.extractDistrict(input) ?? input;
    if (REGION_INFO[label]) return REGION_INFO[label];

    const local = this.extractDistrictName(label) ?? label.match(/([가-힣]{2,5}(?:시|군))/)?.[1] ?? label;
    const city = label.match(/([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))/)?.[1];
    const normalized = city ? `${city} ${local}` : local;
    if (REGION_INFO[normalized]) return REGION_INFO[normalized];
    if (DISTRICT_CORTAR[local]) return REGION_INFO[`${SEOUL_CITY_NAME} ${local}`];

    return {
      label: normalized,
      key: local,
      cortarNo: null,
      ms: null,
    };
  }

  private buildComplexesUrl(region: RegionInfo): string {
    if (region.ms) {
      return `https://new.land.naver.com/search?ms=${region.ms}&a=${NAVER_REAL_ESTATE_TYPES}&e=RETAIL`;
    }
    return `https://new.land.naver.com/complexes?cortarNo=${region.cortarNo ?? ''}&a=${NAVER_REAL_ESTATE_TYPES}&e=RETAIL`;
  }

  // ── 직접 API 호출 ─────────────────────────────────────────────────────────────

  private async fetchViaApi(region: RegionInfo): Promise<ApartmentPriceSummary | null> {
    if (!region.cortarNo) return null;
    // 매매와 전세를 병렬로 조회
    const [dealRes, leaseRes] = await Promise.allSettled([
      this.callComplexMarkersApi(region.cortarNo, 'A1'),  // 매매
      this.callComplexMarkersApi(region.cortarNo, 'B1'),  // 전세
    ]);

    const dealComplexes = dealRes.status === 'fulfilled' ? this.parseComplexes(dealRes.value) : [];
    const leaseComplexes = leaseRes.status === 'fulfilled' ? this.parseComplexes(leaseRes.value) : [];

    const complexNos = this.getUniqueComplexNos([...dealComplexes, ...leaseComplexes]);
    if (complexNos.length > 0) {
      const [dealArticles, leaseArticles] = await Promise.all([
        this.fetchArticlesForComplexes(complexNos, 'A1'),
        this.fetchArticlesForComplexes(complexNos, 'B1'),
      ]);
      if (dealArticles.length > 0 || leaseArticles.length > 0) {
        return this.buildSummary(region, dealArticles, leaseArticles);
      }
    }

    if (dealComplexes.length === 0 && leaseComplexes.length === 0) return null;
    return this.buildSummary(region, dealComplexes, leaseComplexes);
  }

  private async callComplexMarkersApi(cortarNo: string, tradeType: 'A1' | 'B1') {
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

  private async fetchArticlesForComplexes(complexNos: string[], tradeType: 'A1' | 'B1'): Promise<ApartmentComplex[]> {
    const result: ApartmentComplex[] = [];
    for (const complexNo of complexNos.slice(0, MAX_COMPLEXES_FOR_ARTICLES)) {
      for (let page = 1; page <= MAX_ARTICLE_PAGES; page += 1) {
        try {
          const data = await this.callArticlesApi(complexNo, tradeType, page);
          const articles = this.parseArticles(data, complexNo, tradeType);
          result.push(...articles);
          if (!data?.isMoreData || articles.length === 0) break;
        } catch (err) {
          this.logger.debug(`[NaverLand] articles 호출 실패: ${complexNo} ${tradeType} p${page} ${(err as Error).message}`);
          break;
        }
      }
    }
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async callArticlesApi(complexNo: string, tradeType: 'A1' | 'B1', page: number): Promise<any> {
    const params = new URLSearchParams({
      realEstateType: NAVER_REAL_ESTATE_TYPES,
      tradeType,
      tag: '::::::::',
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
      sameAddressGroup: 'true',
      minMaintenanceCost: '',
      maxMaintenanceCost: '',
      priceType: 'RETAIL',
      directions: '',
      page: String(page),
      complexNo,
      buildingNos: '',
      areaNos: '',
      type: 'list',
      order: 'rank',
    });

    const res = await fetch(
      `https://new.land.naver.com/api/articles/complex/${complexNo}?${params}`,
      {
        headers: {
          ...NAVER_HEADERS,
          Accept: '*/*',
          Referer: `https://new.land.naver.com/complexes/${complexNo}?a=${NAVER_REAL_ESTATE_TYPES}&e=RETAIL`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) throw new Error(`articles ${complexNo} ${tradeType} HTTP ${res.status}`);
    return res.json();
  }

  // ── Puppeteer 인터셉트 ────────────────────────────────────────────────────────

  private async fetchViaPuppeteer(region: RegionInfo): Promise<ApartmentPriceSummary | null> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();

    const dealComplexes: ApartmentComplex[] = [];
    const leaseComplexes: ApartmentComplex[] = [];
    const markerComplexes: ApartmentComplex[] = [];

    try {
      await page.setUserAgent(NAVER_HEADERS['User-Agent']);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

      // 네트워크 응답 인터셉트
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/api/complexes/single-markers')) {
          try {
            const json = await response.json();
            const parsed = this.parseComplexes(json);
            if (url.includes('tradeType=A1') || url.includes('tradeType=B1')) {
              if (url.includes('tradeType=A1')) dealComplexes.push(...parsed);
              else leaseComplexes.push(...parsed);
            } else {
              dealComplexes.push(...parsed);
              leaseComplexes.push(...parsed);
            }
            markerComplexes.push(...parsed);
          } catch {}
        }
        if (url.includes('/api/articles/complex/')) {
          try {
            const json = await response.json();
            const tradeType = url.includes('tradeType=B1') ? 'B1' : 'A1';
            const complexNo = url.match(/\/api\/articles\/complex\/(\d+)/)?.[1] ?? '';
            const parsed = this.parseArticles(json, complexNo, tradeType);
            if (tradeType === 'B1') leaseComplexes.push(...parsed);
            else dealComplexes.push(...parsed);
          } catch {}
        }
      });

      const url = this.buildComplexesUrl(region);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3000));

      // 전세 탭으로 전환해 추가 데이터 수집
      try {
        await page.evaluate(() => {
          const tabs = document.querySelectorAll('button, a');
          for (const t of tabs) {
            if (t.textContent?.includes('전세')) { (t as HTMLElement).click(); break; }
          }
        });
        await new Promise((r) => setTimeout(r, 2000));
      } catch {}

      const complexNos = this.getUniqueComplexNos(markerComplexes.length > 0 ? markerComplexes : [...dealComplexes, ...leaseComplexes]);
      if (complexNos.length > 0) {
        const articleResponses = await page.evaluate(
          async ({ nos, realEstateTypes, maxPages }) => {
            const out: Array<{ complexNo: string; tradeType: 'A1' | 'B1'; json: unknown }> = [];
            for (const complexNo of nos) {
              for (const tradeType of ['A1', 'B1'] as const) {
                for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
                  const params = new URLSearchParams({
                    realEstateType: realEstateTypes,
                    tradeType,
                    tag: '::::::::',
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
                    sameAddressGroup: 'true',
                    minMaintenanceCost: '',
                    maxMaintenanceCost: '',
                    priceType: 'RETAIL',
                    directions: '',
                    page: String(pageNo),
                    complexNo,
                    buildingNos: '',
                    areaNos: '',
                    type: 'list',
                    order: 'rank',
                  });
                  const res = await fetch(`/api/articles/complex/${complexNo}?${params}`, {
                    credentials: 'include',
                    headers: { accept: '*/*' },
                  });
                  if (!res.ok) break;
                  const json = await res.json();
                  out.push({ complexNo, tradeType, json });
                  if (!json?.isMoreData || !Array.isArray(json?.articleList) || json.articleList.length === 0) break;
                }
              }
            }
            return out;
          },
          {
            nos: complexNos.slice(0, MAX_COMPLEXES_FOR_ARTICLES),
            realEstateTypes: NAVER_REAL_ESTATE_TYPES,
            maxPages: MAX_ARTICLE_PAGES,
          },
        );

        const articleDealComplexes = articleResponses.flatMap((item) =>
          item.tradeType === 'A1' ? this.parseArticles(item.json, item.complexNo, 'A1') : [],
        );
        const articleLeaseComplexes = articleResponses.flatMap((item) =>
          item.tradeType === 'B1' ? this.parseArticles(item.json, item.complexNo, 'B1') : [],
        );
        if (articleDealComplexes.length > 0 || articleLeaseComplexes.length > 0) {
          dealComplexes.splice(0, dealComplexes.length, ...articleDealComplexes);
          leaseComplexes.splice(0, leaseComplexes.length, ...articleLeaseComplexes);
        }
      }
    } finally {
      await browser.close();
    }

    if (dealComplexes.length === 0 && leaseComplexes.length === 0) return null;
    return this.buildSummary(region, dealComplexes, leaseComplexes);
  }

  // ── 파싱 / 집계 ──────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseComplexes(data: any): ApartmentComplex[] {
    const list = this.collectComplexLikeItems(data);
    const result: ApartmentComplex[] = [];

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = item as Record<string, any>;
      const dealPrice = this.pickAveragePrice([
        c.dealPrice, c.averageDealPrice, c.representativeDealPrice, c.dealPriceMin, c.price,
      ], [c.minDealPrice, c.maxDealPrice, c.dealPriceMin, c.dealPriceMax]);
      const leasePrice = this.pickAveragePrice([
        c.leasePrice, c.averageLeasePrice, c.representativeLeasePrice, c.leasePriceMin, c.rentPrice,
      ], [c.minLeasePrice, c.maxLeasePrice, c.leasePriceMin, c.leasePriceMax]);
      result.push({
        complexNo: String(c.complexNo ?? c.no ?? ''),
        complexName: String(c.complexName ?? c.name ?? ''),
        dealPrice,
        leasePrice,
        householdCount: typeof c.totalHouseHoldCount === 'number' ? c.totalHouseHoldCount : null,
        buildYear: typeof c.buildYear === 'number' ? c.buildYear : null,
      });
    }
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseArticles(data: any, fallbackComplexNo: string, fallbackTradeType: 'A1' | 'B1'): ApartmentComplex[] {
    const list: unknown[] = Array.isArray(data?.articleList) ? data.articleList : [];
    return list.map((item) => {
      const article = item as Record<string, unknown>;
      const tradeType = article.tradeTypeCode === 'B1' || article.tradeTypeName === '전세' ? 'B1'
        : article.tradeTypeCode === 'A1' || article.tradeTypeName === '매매' ? 'A1'
          : fallbackTradeType;
      const price = this.parsePrice(article.dealOrWarrantPrc ?? article.sameAddrMinPrc ?? article.sameAddrMaxPrc);
      return {
        complexNo: String(article.complexNo ?? fallbackComplexNo ?? ''),
      complexName: String(article.articleName ?? article.complexName ?? ''),
        dealPrice: tradeType === 'A1' ? price : null,
        leasePrice: tradeType === 'B1' ? price : null,
        householdCount: null,
        buildYear: null,
      };
    }).filter((item) => item.dealPrice !== null || item.leasePrice !== null);
  }

  private getUniqueComplexNos(complexes: ApartmentComplex[]): string[] {
    return [...new Set(complexes.map((complex) => complex.complexNo).filter(Boolean))];
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
      const obj = value as Record<string, unknown>;
      if (obj.complexNo || obj.complexName || obj.markerId || obj.minDealPrice || obj.minLeasePrice) {
        result.push(obj);
      }
      for (const key of ['data', 'complexList', 'markerList', 'markers', 'list']) {
        if (obj[key]) visit(obj[key]);
      }
    };
    visit(data);
    return result;
  }

  private pickAveragePrice(candidates: unknown[], rangeCandidates: unknown[]): number | null {
    for (const candidate of candidates) {
      const parsed = this.parsePrice(candidate);
      if (parsed) return parsed;
    }
    const rangePrices = rangeCandidates
      .map((candidate) => this.parsePrice(candidate))
      .filter((value): value is number => value !== null && value > 0);
    if (rangePrices.length === 0) return null;
    return Math.round(rangePrices.reduce((sum, value) => sum + value, 0) / rangePrices.length);
  }

  private parsePrice(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
    if (typeof value !== 'string') return null;

    const text = value.replace(/,/g, '').trim();
    if (!text || text === '-' || text === '0') return null;

    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);

    const eokMatch = text.match(/(\d+(?:\.\d+)?)\s*억/);
    const manMatch = text.match(/억\s*(\d+(?:\.\d+)?)/) ?? text.match(/(\d+(?:\.\d+)?)\s*만/);
    const eok = eokMatch ? Number(eokMatch[1]) * 10000 : 0;
    const man = manMatch ? Number(manMatch[1]) : 0;
    const parsed = eok + man;
    return parsed > 0 ? Math.round(parsed) : null;
  }

  private buildSummary(
    region: RegionInfo,
    dealComplexes: ApartmentComplex[],
    leaseComplexes: ApartmentComplex[],
  ): ApartmentPriceSummary {
    const dealPrices = dealComplexes.map((c) => c.dealPrice).filter((v): v is number => v !== null && v > 0);
    const leasePrices = leaseComplexes.map((c) => c.leasePrice).filter((v): v is number => v !== null && v > 0);

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const min = (arr: number[]) => arr.length ? Math.min(...arr) : null;
    const max = (arr: number[]) => arr.length ? Math.max(...arr) : null;

    const complexKeys = new Set([...dealComplexes, ...leaseComplexes]
      .map((complex) => complex.complexNo || complex.complexName)
      .filter(Boolean));

    return {
      district: region.label,
      avgDealPrice: avg(dealPrices),
      avgLeasePrice: avg(leasePrices),
      minDealPrice: min(dealPrices),
      maxDealPrice: max(dealPrices),
      minLeasePrice: min(leasePrices),
      maxLeasePrice: max(leasePrices),
      complexCount: complexKeys.size || Math.max(dealComplexes.length, leaseComplexes.length),
      naverLandUrl: this.buildComplexesUrl(region),
    };
  }
}
