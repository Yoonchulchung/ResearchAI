import { Injectable } from '@nestjs/common';
import { LandImplService } from 'src/financial/application/land/land-impl.service';

@Injectable()
export class LandService {
  constructor(private readonly impl: LandImplService) {}

  getOverview(query = '서울특별시 강남구', limit = 30) {
    return this.impl.getOverview(query, limit);
  }
}
