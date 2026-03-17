import { Controller, Get, Post, Body } from '@nestjs/common';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { WebSearchService } from '../application/web-search.service';
import { ResearchService } from '../application/research.service';
import { TestLightSearchDto } from './dto/request/test-light-search.dto';
import { TestSearchDto } from './dto/request/test-search.dto';

import { TestLightSearchResponseDto } from './dto/response/test-light-search.response.dto';
import { TestStep0PlanDto, TestStep1aWebSearchDto, TestStep1bRecruitSearchDto, TestStep2GenerateTasksDto } from './dto/request/test-pipeline-step.dto';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly searchService: WebSearchService,
    private readonly aiService: ResearchService,
  ) {}

  @Get('models')
  getModels() {
    return this.aiProvider.getLocalAiModels();
  }

  @Get('search-engines')
  getSearchEngines() {
    return this.searchService.getAvailableEngines();
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

  // ****************** //
  // 파이프라인 스텝 디버그  //
  // ****************** //
  @Post('test/pipeline/step0')
  testStep0Plan(@Body() body: TestStep0PlanDto) {
    return this.aiService.testStep0Plan(body.topic, body.localAIModel, body.searchMode);
  }

  @Post('test/pipeline/step1a')
  testStep1aWebSearch(@Body() body: TestStep1aWebSearchDto) {
    return this.aiService.testStep1aWebSearch(body.keyword, body.webModel);
  }

  @Post('test/pipeline/step1b')
  testStep1bRecruitSearch(@Body() body: TestStep1bRecruitSearchDto) {
    return this.aiService.testStep1bRecruitSearch(body.keyword, body.companyTypes, body.jobTypes);
  }

  @Post('test/pipeline/step2')
  testStep2GenerateTasks(@Body() body: TestStep2GenerateTasksDto) {
    return this.aiService.testStep2GenerateTasks(body.topic, body.model, body.searchPlan, body.webContext, body.recruitCtx);
  }
}
