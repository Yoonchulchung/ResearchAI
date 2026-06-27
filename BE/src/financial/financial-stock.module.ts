import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrowseModule } from 'src/browse/browse.module';
import { StockDashboardService } from 'src/financial/application/stock/stock-dashboard.service';
import { StockDashboardImplService } from 'src/financial/application/stock/stock-dashboard-impl.service';
import { StockMarketService } from 'src/financial/application/stock/stock-market.service';
import { StockMarketImplService } from 'src/financial/application/stock/stock-market-impl.service';
import { StockQuoteService } from 'src/financial/application/stock/stock-quote.service';
import { StockQuoteImplService } from 'src/financial/application/stock/stock-quote-impl.service';
import { StockCacheEntity } from 'src/financial/domain/stock/stock-cache.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { NaverStockMarketAdapter } from 'src/financial/infrastructure/stock/naver-stock-market.adapter';
import { YahooStockMarketAdapter } from 'src/financial/infrastructure/stock/yahoo-stock-market.adapter';

@Module({
  imports: [
    BrowseModule,
    TypeOrmModule.forFeature([
      StockCacheEntity,
      CompanyEntity,
      CompanyFinancialEntity,
    ]),
  ],
  providers: [
    StockDashboardService,
    StockDashboardImplService,
    StockMarketService,
    StockMarketImplService,
    StockQuoteService,
    StockQuoteImplService,
    NaverStockMarketAdapter,
    YahooStockMarketAdapter,
  ],
  exports: [StockDashboardService, StockMarketService, StockQuoteService],
})
export class FinancialStockModule {}
