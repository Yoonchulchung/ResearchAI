import { Injectable } from '@nestjs/common';
import {
  StockInfo,
  StockQuote,
  StockSearchItem,
} from 'src/financial/domain/stock/stock-market.types';
import {
  ChartPoint,
  MarketItem,
  StockMarketImplService,
} from 'src/financial/application/stock/stock-market-impl.service';

export type {
  ChartPoint,
  MarketItem,
} from 'src/financial/application/stock/stock-market-impl.service';

@Injectable()
export class StockMarketService {
  constructor(private readonly impl: StockMarketImplService) {}

  searchStocks(query: string, requestedLimit = 10): Promise<StockSearchItem[]> {
    return this.impl.searchStocks(query, requestedLimit);
  }

  getStockInfo(symbol: string): Promise<StockInfo> {
    return this.impl.getStockInfo(symbol);
  }

  getStockQuote(
    symbol: string,
    name: string,
    interval = '1d',
    before?: string,
  ): Promise<StockQuote> {
    return this.impl.getStockQuote(symbol, name, interval, before);
  }

  getMarketData(): Promise<MarketItem[]> {
    return this.impl.getMarketData();
  }

  getMarketPrice(symbol: string): Promise<MarketItem | null> {
    return this.impl.getMarketPrice(symbol);
  }

  getMarketChart(symbol: string, range: string): Promise<ChartPoint[]> {
    return this.impl.getMarketChart(symbol, range);
  }
}
