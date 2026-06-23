import { Module } from '@nestjs/common';
import { StockMarketService } from 'src/stock/application/stock-market.service';
import { StockDashboardService } from 'src/stock/application/stock-dashboard.service';
import { StockController } from 'src/stock/presentation/stock.controller';
import { NaverStockMarketAdapter } from 'src/stock/infrastructure/naver-stock-market.adapter';
import { YahooStockMarketAdapter } from 'src/stock/infrastructure/yahoo-stock-market.adapter';
import { BrowseModule } from 'src/browse/browse.module';

/**
 * 주식 시세, 차트, 종목 데이터를 소유하는 독립 모듈.
 *
 * 데이터 제공처가 바뀌더라도 news 모듈에는 영향을 주지 않도록
 * 주식 관련 의존성을 이 경계 안에 둔다.
 */
@Module({
  imports: [BrowseModule],
  controllers: [StockController],
  providers: [
    StockMarketService,
    StockDashboardService,
    NaverStockMarketAdapter,
    YahooStockMarketAdapter,
  ],
  exports: [StockMarketService],
})
export class StockModule {}
