import { Controller, Get, Post, Body } from '@nestjs/common';
import { ModelsService } from '../../ai/application/models.service';
import { WebSearchService } from '../application/web-search.service';
import { ResearchService } from '../application/research.service';
import { TestLightSearchDto } from './dto/request/test-light-search.dto';
import { TestSearchDto } from './dto/request/test-search.dto';
import { TestOllamaFilterDto } from './dto/request/test-ollama-filter.dto';
import { TestLightSearchResponseDto } from './dto/response/test-light-search.response.dto';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly modelsService: ModelsService,
    private readonly searchService: WebSearchService,
    private readonly aiService: ResearchService,
  ) {}

  @Get('models')
  getModels() {
    return this.modelsService.getModels();
  }

  // *************** //
  // 서칭 프롬프트 디버그 //
  // *************** //
  @Post('test/light-search')
  async testGenerateTasks(@Body() body: TestLightSearchDto): Promise<TestLightSearchResponseDto> {
    const result = await this.aiService.testGenerateTasks(body.topic, body.model, {
      customPrompt: body.customPrompt,
      customSystem: body.customSystem,
      searchMode: body.searchMode,
    });
    return TestLightSearchResponseDto.from(result);
  }

  @Post('test/search')
  testSearch(@Body() body: TestSearchDto) {
    return this.searchService.testSearchEngine(body.engine as any, body.query);
  }

  @Post('test/ollama-filter')
  testOllamaFilter(@Body() body: TestOllamaFilterDto) {
    return this.searchService.testOllamaFilter(body.query, body.context, body.customFilterPrompt);
  }
}
