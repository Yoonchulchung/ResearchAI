import { Injectable } from '@nestjs/common';
import { StockDashboard } from 'src/financial/domain/stock/stock-market.types';
import { StockDashboardImplService } from 'src/financial/application/stock/stock-dashboard-impl.service';

@Injectable()
export class StockDashboardService {
  constructor(private readonly impl: StockDashboardImplService) {}

  getDashboard(requestedLimit = 20): Promise<StockDashboard> {
    return this.impl.getDashboard(requestedLimit);
  }
}
