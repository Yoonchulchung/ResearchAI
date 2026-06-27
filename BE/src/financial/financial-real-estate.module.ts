import { Module } from '@nestjs/common';
import { LandService } from 'src/financial/application/land/land.service';
import { LandImplService } from 'src/financial/application/land/land-impl.service';
import { LandController } from 'src/financial/presentation/land.controller';
import { NaverLandAdapter } from 'src/financial/infrastructure/land/naver-land.adapter';
import { NaverLandService } from 'src/financial/infrastructure/real-estate/naver-land.service';
import { NeonetRealEstatePriceService } from 'src/financial/infrastructure/real-estate/neonet-real-estate-price.service';
import { ZippoomRealEstateUrlService } from 'src/financial/infrastructure/real-estate/zippoom-real-estate-url.service';

@Module({
  controllers: [LandController],
  providers: [
    LandService,
    LandImplService,
    NaverLandAdapter,
    NaverLandService,
    NeonetRealEstatePriceService,
    ZippoomRealEstateUrlService,
  ],
  exports: [
    LandService,
    NaverLandService,
    NeonetRealEstatePriceService,
    ZippoomRealEstateUrlService,
  ],
})
export class FinancialRealEstateModule {}
