import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { PuppeteerService } from './puppeteer.service';

@Module({
  controllers: [NewsController],
  providers: [PuppeteerService],
  exports: [PuppeteerService],
})
export class NewsModule {}
