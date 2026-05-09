import { Module } from '@nestjs/common';
import { HotPapersService } from './application/hot-papers.service';
import { HotPapersController } from './presentation/hot-papers.controller';

@Module({
  controllers: [HotPapersController],
  providers: [HotPapersService],
})
export class HotPapersModule {}
