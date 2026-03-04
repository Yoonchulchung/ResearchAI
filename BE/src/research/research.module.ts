import { Module } from '@nestjs/common';
import { ResearchController } from './presentation/research.controller';
import { ModelsService } from './application/models.service';
import { SearchService } from './application/search.service';
import { AiService } from './application/ai.service';

@Module({
  controllers: [ResearchController],
  providers: [ModelsService, SearchService, AiService],
})
export class ResearchModule {}
