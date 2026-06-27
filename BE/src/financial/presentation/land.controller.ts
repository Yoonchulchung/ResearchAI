import { Controller, Get, Query } from '@nestjs/common';
import { LandService } from 'src/financial/application/land/land.service';

@Controller('land')
export class LandController {
  constructor(private readonly landService: LandService) {}

  @Get('overview')
  getOverview(
    @Query('q') query = '서울특별시 강남구',
    @Query('limit') limit = '30',
  ) {
    return this.landService.getOverview(query, Number(limit));
  }
}
