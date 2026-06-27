import { Injectable } from '@nestjs/common';
import { StockQuote } from 'src/financial/domain/stock/stock-market.types';
import { StockQuoteImplService } from 'src/financial/application/stock/stock-quote-impl.service';

@Injectable()
export class StockQuoteService {
  constructor(private readonly impl: StockQuoteImplService) {}

  getMarketMetricsByStockCode(
    stockCode: string | null | undefined,
  ): Promise<StockQuote['marketMetrics']> {
    return this.impl.getMarketMetricsByStockCode(stockCode);
  }

  getStockQuote(
    idOrName: string,
    interval: string = '1d',
    before?: string,
  ): Promise<StockQuote> {
    return this.impl.getStockQuote(idOrName, interval, before);
  }
}
