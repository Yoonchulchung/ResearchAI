import { Controller, Get, Query } from '@nestjs/common';
import {
  ChartPoint,
  MarketItem,
  StockMarketService,
} from 'src/stock/application/stock-market.service';
import { StockDashboardService } from 'src/stock/application/stock-dashboard.service';
import {
  StockDashboard,
  StockQuote,
  StockSearchItem,
} from 'src/stock/domain/stock-market.types';

/**
 * 주식·시장 데이터 전용 HTTP 진입점.
 *
 * 외부 소비자는 뉴스 도메인을 거치지 않고 `/stock` API를 사용한다.
 */
@Controller('stock')
export class StockController {
  constructor(
    private readonly stockMarketService: StockMarketService,
    private readonly stockDashboardService: StockDashboardService,
  ) {}

  @Get('dashboard')
  getDashboard(@Query('limit') limit = '20'): Promise<StockDashboard> {
    return this.stockDashboardService.getDashboard(Number(limit) || 20);
  }

  @Get('market')
  getMarketData(): Promise<MarketItem[]> {
    return this.stockMarketService.getMarketData();
  }

  @Get('search')
  searchStocks(
    @Query('q') query = '',
    @Query('limit') limit = '10',
  ): Promise<StockSearchItem[]> {
    return this.stockMarketService.searchStocks(query, Number(limit) || 10);
  }

  @Get('quote')
  getStockQuote(
    @Query('symbol') symbol = '',
    @Query('name') name = '',
    @Query('interval') interval = '1d',
    @Query('before') before?: string,
  ): Promise<StockQuote> {
    return this.stockMarketService.getStockQuote(
      symbol,
      name,
      interval,
      before,
    );
  }

  @Get('chart')
  getMarketChart(
    @Query('symbol') symbol = '^KS11',
    @Query('range') range = '1mo',
  ): Promise<ChartPoint[]> {
    return this.stockMarketService.getMarketChart(symbol, range);
  }

  @Get('price')
  getMarketPrice(
    @Query('symbol') symbol = '^KS11',
  ): Promise<MarketItem | null> {
    return this.stockMarketService.getMarketPrice(symbol);
  }
}
