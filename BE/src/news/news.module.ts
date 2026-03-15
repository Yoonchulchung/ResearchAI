import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsController } from './news.controller';
import { NewsService } from './application/service/news.service';
import { PuppeteerService } from './puppeteer.service';
import { NewsBriefingEntity } from './domain/entity/news-briefing.entity';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([NewsBriefingEntity]), AiModule],
  controllers: [NewsController],
  providers: [PuppeteerService, NewsService],
  exports: [PuppeteerService],
})
export class NewsModule {}
