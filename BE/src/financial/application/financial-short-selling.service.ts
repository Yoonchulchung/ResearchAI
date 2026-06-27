import { Injectable } from '@nestjs/common';
import { ShortSellingData } from 'src/financial/infrastructure/krx/krx-short-selling.service';
import { FinancialShortSellingImplService } from 'src/financial/application/krx/financial-short-selling-impl.service';

@Injectable()
export class FinancialShortSellingService {
  constructor(private readonly impl: FinancialShortSellingImplService) {}

  getByCompanyId(companyId: string, days = 90): Promise<ShortSellingData> {
    return this.impl.getByCompanyId(companyId, days);
  }

  getBySymbol(symbol: string, days = 90): Promise<ShortSellingData> {
    return this.impl.getBySymbol(symbol, days);
  }
}
