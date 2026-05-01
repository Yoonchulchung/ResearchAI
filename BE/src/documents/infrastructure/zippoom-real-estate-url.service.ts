import { Injectable } from '@nestjs/common';

const ZIPPOOM_BASE_URL = 'https://zippoom.com';
const SEOUL_CITY_NAME = '서울특별시';

const CITY_SLUG_LABELS: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  강원도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

const SEOUL_DISTRICTS = new Set([
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구',
  '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구',
  '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구',
]);

@Injectable()
export class ZippoomRealEstateUrlService {
  extractDistrict(address: string | null | undefined): string | null {
    if (!address) return null;

    const normalizedAddress = address.replace('충첨남도', '충청남도');
    const cityMatch = normalizedAddress.match(/([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))/);
    const city = cityMatch?.[1] ?? null;
    const addressAfterCity = city && cityMatch ? normalizedAddress.slice((cityMatch.index ?? 0) + city.length) : normalizedAddress;
    const local = addressAfterCity.match(/([가-힣]{2,8}(?:구|시|군))/)?.[1] ?? null;

    if (!local) return null;
    if (city) return `${city} ${local}`;
    if (SEOUL_DISTRICTS.has(local)) return `${SEOUL_CITY_NAME} ${local}`;
    return local;
  }

  buildApartmentUrl(addressOrDistrict: string | null | undefined): string {
    const district = this.extractDistrict(addressOrDistrict) ?? addressOrDistrict?.trim();
    if (!district) return `${ZIPPOOM_BASE_URL}/지역별-부동산`;

    return encodeURI(`${ZIPPOOM_BASE_URL}/지역별-부동산/${this.toDistrictSlug(district)}/아파트`);
  }

  private toDistrictSlug(district: string): string {
    const city = district.match(/([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))/)?.[1] ?? null;
    const local = district.match(/([가-힣]{2,8}(?:구|시|군))$/)?.[1] ?? null;

    if (city && local) return `${CITY_SLUG_LABELS[city] ?? city}-${local}`;
    if (local && SEOUL_DISTRICTS.has(local)) return `서울-${local}`;
    return district.trim().replace(/\s+/g, '-');
  }
}
