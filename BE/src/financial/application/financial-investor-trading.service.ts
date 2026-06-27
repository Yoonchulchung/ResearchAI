import { Injectable } from '@nestjs/common';
import { InvestorTradingData } from 'src/financial/infrastructure/krx/krx-investor.service';
import { FinancialInvestorTradingImplService } from 'src/financial/application/krx/financial-investor-trading-impl.service';

@Injectable()
export class FinancialInvestorTradingService {
  constructor(private readonly impl: FinancialInvestorTradingImplService) {}

  getByCompanyId(companyId: string, days = 30): Promise<InvestorTradingData> {
    return this.impl.getByCompanyId(companyId, days);
  }

  getBySymbol(symbol: string, days = 30): Promise<InvestorTradingData> {
    return this.impl.getBySymbol(symbol, days);
  }
}
