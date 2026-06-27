import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialCacheEntity } from 'src/financial/domain/financial-cache.entity';
import { FinancialShortSellingService } from 'src/financial/application/financial-short-selling.service';
import { FinancialShortSellingImplService } from 'src/financial/application/krx/financial-short-selling-impl.service';
import { FinancialInvestorTradingService } from 'src/financial/application/financial-investor-trading.service';
import { FinancialInvestorTradingImplService } from 'src/financial/application/krx/financial-investor-trading-impl.service';
import { FinancialAutoRegisterService } from 'src/financial/application/financial-auto-register.service';
import { FinancialAutoRegisterImplService } from 'src/financial/application/registration/financial-auto-register-impl.service';
import { StockResearchService } from 'src/financial/application/stock/stock-research.service';
import { StockResearchImplService } from 'src/financial/application/stock/stock-research-impl.service';
import { FinancialController } from 'src/financial/presentation/financial.controller';
import { FinancialDartModule } from 'src/financial/financial-dart.module';
import { FinancialStockModule } from 'src/financial/financial-stock.module';
import { FinancialRealEstateModule } from 'src/financial/financial-real-estate.module';
import { CompanyModule } from 'src/company/company.module';
import { ResearchModule } from 'src/research/research.module';
import { AiModule } from 'src/ai/ai.module';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { KrxInvestorService } from 'src/financial/infrastructure/krx/krx-investor.service';
import { KrxShortSellingService } from 'src/financial/infrastructure/krx/krx-short-selling.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinancialCacheEntity,
      CompanyEntity,
      CompanyFinancialEntity,
    ]),
    FinancialDartModule,
    FinancialStockModule,
    FinancialRealEstateModule,
    CompanyModule,
    ResearchModule,
    AiModule,
  ],
  controllers: [FinancialController],
  providers: [
    FinancialShortSellingService,
    FinancialShortSellingImplService,
    FinancialInvestorTradingService,
    FinancialInvestorTradingImplService,
    FinancialAutoRegisterService,
    FinancialAutoRegisterImplService,
    StockResearchService,
    StockResearchImplService,
    KrxInvestorService,
    KrxShortSellingService,
  ],
  exports: [
    FinancialShortSellingService,
    FinancialInvestorTradingService,
    FinancialAutoRegisterService,
    StockResearchService,
    KrxInvestorService,
    KrxShortSellingService,
    FinancialDartModule,
    FinancialStockModule,
    FinancialRealEstateModule,
  ],
})
export class FinancialModule {}
