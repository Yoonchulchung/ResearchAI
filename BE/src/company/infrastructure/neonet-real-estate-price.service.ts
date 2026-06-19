import { Injectable, Logger } from '@nestjs/common';
import { load } from 'cheerio';

export interface NeonetApartmentListing {
  id: string;
  name: string;
  tradeType: 'deal' | 'lease';
  price: number; // 만원
}

export interface NeonetApartmentPriceSummary {
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

interface RegionInfo {
  label: string;
  regionCd: string | null;
}

const SEOUL_CITY_NAME = '서울특별시';
const NEONET_BASE_URL = 'https://www.neonet.co.kr/novo-rebank';
const MAX_PAGES_PER_TRADE = 15;

const SEOUL_REGION_CODES: Record<string, string> = {
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

const REGION_CODES: Record<string, string> = {
  '충청남도 서산시': '4421000000',
};

for (const [district, regionCd] of Object.entries(SEOUL_REGION_CODES)) {
  REGION_CODES[`${SEOUL_CITY_NAME} ${district}`] = regionCd;
}

const REGION_LABEL_BY_CODE = Object.fromEntries(
  Object.entries(REGION_CODES).map(([label, regionCd]) => [regionCd, label]),
);

const NEONET_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: `${NEONET_BASE_URL}/view/offerings/OfferingsIndex.neo`,
};

@Injectable()
export class NeonetRealEstatePriceService {
  private readonly logger = new Logger(NeonetRealEstatePriceService.name);

  extractDistrict(address: string | null | undefined): string | null {
    if (!address) return null;

    const normalizedAddress = address.replace('충첨남도', '충청남도');
    const cityMatch = normalizedAddress.match(
      /([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))/,
    );
    const city = cityMatch?.[1] ?? null;
    const addressAfterCity =
      city && cityMatch
        ? normalizedAddress.slice((cityMatch.index ?? 0) + city.length)
        : normalizedAddress;
    const local =
      addressAfterCity.match(/([가-힣]{2,8}(?:구|시|군))/)?.[1] ?? null;

    if (!local) return null;
    if (city) return `${city} ${local}`;
    if (SEOUL_REGION_CODES[local]) return `${SEOUL_CITY_NAME} ${local}`;
    return local;
  }

  buildScodeListUrl(addressOrDistrict: string | null | undefined): string {
    const region = this.resolveRegion(addressOrDistrict);
    const params = new URLSearchParams({
      offerings_gbn: 'AT',
      region_cd: region?.regionCd ?? '',
    });
    return `${NEONET_BASE_URL}/view/offerings/ScodeList.neo?${params}`;
  }

  async fetchDistrictPrices(
    addressOrDistrict: string,
  ): Promise<NeonetApartmentPriceSummary | null> {
    const region = this.resolveRegion(addressOrDistrict);
    if (!region?.regionCd) {
      this.logger.debug(`[Neonet] 지역 코드 없음: ${addressOrDistrict}`);
      return null;
    }

    const [dealListings, leaseListings] = await Promise.all([
      this.fetchListings(region.regionCd, 'P', 'deal'),
      this.fetchListings(region.regionCd, 'L', 'lease'),
    ]);

    if (dealListings.length === 0 && leaseListings.length === 0) return null;
    return this.buildSummary(region, dealListings, leaseListings);
  }

  private resolveRegion(
    addressOrDistrict: string | null | undefined,
  ): RegionInfo | null {
    const regionCdFromUrl = this.extractRegionCd(addressOrDistrict);
    if (regionCdFromUrl) {
      return {
        label: REGION_LABEL_BY_CODE[regionCdFromUrl] ?? regionCdFromUrl,
        regionCd: regionCdFromUrl,
      };
    }

    const district =
      this.extractDistrict(addressOrDistrict) ?? addressOrDistrict?.trim();
    if (!district) return null;

    const local =
      district.match(/([가-힣]{2,8}(?:구|시|군))$/)?.[1] ?? district;
    const label = REGION_CODES[district]
      ? district
      : SEOUL_REGION_CODES[local]
        ? `${SEOUL_CITY_NAME} ${local}`
        : district;

    return {
      label,
      regionCd: REGION_CODES[label] ?? null,
    };
  }

  private extractRegionCd(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.searchParams.get('region_cd');
    } catch {
      return value.match(/[?&]region_cd=(\d{10})/)?.[1] ?? null;
    }
  }

  private async fetchListings(
    regionCd: string,
    offerGbn: 'P' | 'L',
    tradeType: 'deal' | 'lease',
  ): Promise<NeonetApartmentListing[]> {
    const listings: NeonetApartmentListing[] = [];
    const seen = new Set<string>();
    let maxPage = 1;

    for (
      let page = 1;
      page <= Math.min(maxPage, MAX_PAGES_PER_TRADE);
      page += 1
    ) {
      const html = await this.fetchOfferingsPage(regionCd, offerGbn, page);
      if (page === 1) maxPage = Math.max(1, this.extractMaxPage(html));

      const pageListings = this.parseOfferingsPage(html, tradeType);
      for (const listing of pageListings) {
        const key =
          listing.id || `${listing.tradeType}:${listing.name}:${listing.price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        listings.push(listing);
      }

      if (pageListings.length === 0) break;
    }

    return listings;
  }

  private async fetchOfferingsPage(
    regionCd: string,
    offerGbn: 'P' | 'L',
    page: number,
  ): Promise<string> {
    const params = new URLSearchParams({
      offerings_gbn: 'AT',
      sub_offerings_gbn: '',
      offer_gbn: offerGbn,
      region_cd: regionCd,
      area: '',
      price: '',
      area_min: '',
      area_max: '',
      price_min: '',
      price_max: '',
      price_month: '',
      price_month_min: '',
      price_month_max: '',
      sort_list: '',
      prc_sort: '',
    });
    if (page > 1) params.set('page', String(page));

    const url = `${NEONET_BASE_URL}/view/offerings/inc_OfferingsList.neo?${params}`;
    const res = await fetch(url, {
      headers: {
        ...NEONET_HEADERS,
        Referer: this.buildReferer(regionCd),
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Neonet HTTP ${res.status}`);
    return this.decodeKoreanHtml(await res.arrayBuffer());
  }

  private parseOfferingsPage(
    html: string,
    tradeType: 'deal' | 'lease',
  ): NeonetApartmentListing[] {
    const $ = load(html);
    const listings: NeonetApartmentListing[] = [];
    const tradeLabel = tradeType === 'deal' ? '매매' : '전세';

    $('tr').each((_, row) => {
      const cells = $(row)
        .find('td')
        .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
        .get();
      if (cells.length < 8 || cells[0] !== tradeLabel) return;

      const priceText = [...cells]
        .reverse()
        .find((cell) => /^\d{1,3}(?:,\d{3})+$/.test(cell));
      const price = this.parseManwonPrice(priceText);
      if (!price) return;

      const detailLink = $(row).find('a[href*="onClickDetail"]').first();
      const id = detailLink.attr('href')?.match(/'(\d+)'/)?.[1] ?? '';
      const name =
        detailLink.text().replace(/\s+/g, ' ').trim() ||
        cells.find(
          (cell) =>
            /[가-힣]/.test(cell) && cell !== tradeLabel && cell !== '아파트',
        ) ||
        '아파트';

      listings.push({ id, name, tradeType, price });
    });

    return listings;
  }

  private extractMaxPage(html: string): number {
    const pages = [...html.matchAll(/[?&amp;]page=(\d+)/g)]
      .map((match) => Number(match[1]))
      .filter((page) => Number.isFinite(page) && page > 0);
    return pages.length ? Math.max(...pages, 1) : 1;
  }

  private parseManwonPrice(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  private decodeKoreanHtml(buffer: ArrayBuffer): string {
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch {
      return Buffer.from(buffer).toString('utf8');
    }
  }

  private buildReferer(regionCd: string): string {
    const params = new URLSearchParams({
      offerings_gbn: 'AT',
      region_cd: regionCd,
    });
    return `${NEONET_BASE_URL}/view/offerings/ScodeList.neo?${params}`;
  }

  private buildSummary(
    region: RegionInfo,
    dealListings: NeonetApartmentListing[],
    leaseListings: NeonetApartmentListing[],
  ): NeonetApartmentPriceSummary {
    const dealPrices = dealListings
      .map((listing) => listing.price)
      .filter((price) => price > 0);
    const leasePrices = leaseListings
      .map((listing) => listing.price)
      .filter((price) => price > 0);
    const uniqueComplexes = new Set(
      [...dealListings, ...leaseListings]
        .map((listing) => listing.name)
        .filter(Boolean),
    );

    return {
      district: region.label,
      avgDealPrice: this.avg(dealPrices),
      avgLeasePrice: this.avg(leasePrices),
      minDealPrice: this.min(dealPrices),
      maxDealPrice: this.max(dealPrices),
      minLeasePrice: this.min(leasePrices),
      maxLeasePrice: this.max(leasePrices),
      complexCount:
        uniqueComplexes.size ||
        Math.max(dealListings.length, leaseListings.length),
      naverLandUrl: this.buildScodeListUrl(region.label),
    };
  }

  private avg(values: number[]): number | null {
    return values.length
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : null;
  }

  private min(values: number[]): number | null {
    return values.length ? Math.min(...values) : null;
  }

  private max(values: number[]): number | null {
    return values.length ? Math.max(...values) : null;
  }
}
