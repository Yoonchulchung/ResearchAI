import { Injectable } from '@nestjs/common';
import { NaverLandAdapter } from 'src/financial/infrastructure/land/naver-land.adapter';

@Injectable()
export class LandImplService {
  constructor(private readonly naverLand: NaverLandAdapter) {}

  getOverview(query = '서울특별시 강남구', limit = 30) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 30, 5), 80);
    return this.naverLand.fetchOverview(
      query.trim() || '서울특별시 강남구',
      normalizedLimit,
    );
  }
}
