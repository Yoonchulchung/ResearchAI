import { Controller, Get, Post, Body } from '@nestjs/common';
import { ResearchService } from './research.service';

@Controller('research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get('models')
  getModels() {
    return this.researchService.getModels();
  }

  @Post('search')
  runSearch(@Body() body: { prompt: string }) {
    return this.researchService.runSearch(body.prompt);
  }

  @Post()
  runResearch(@Body() body: { prompt: string; model: string; context?: string }) {
    return this.researchService.runResearch(body.prompt, body.model, body.context);
  }

  @Post('generate-tasks')
  generateTasks(@Body() body: { topic: string; model: string }) {
    return this.researchService.generateTasks(body.topic, body.model);
  }

  @Get('prompts')
  getPromptTemplates() {
    return this.researchService.getPromptTemplates();
  }

  @Post('test/generate-tasks')
  testGenerateTasks(@Body() body: { topic: string; model: string; customPrompt?: string; customSystem?: string }) {
    return this.researchService.testGenerateTasks(body.topic, body.model, {
      customPrompt: body.customPrompt,
      customSystem: body.customSystem,
    });
  }

  @Get('pipeline-status')
  getPipelineStatus() {
    return this.researchService.getPipelineStatus();
  }

  @Get('tavily/overview')
  getTavilyOverview() {
    return this.researchService.getTavilyOverview();
  }

  @Get('anthropic/usage')
  getAnthropicUsage() {
    return this.researchService.getAnthropicUsage();
  }

  @Post('test/search')
  testSearch(@Body() body: { engine: string; query: string }) {
    return this.researchService.testSearchEngine(body.engine as any, body.query);
  }

  @Post('test/ollama-filter')
  testOllamaFilter(@Body() body: { query: string; context: string; customFilterPrompt?: string }) {
    return this.researchService.testOllamaFilter(body.query, body.context, body.customFilterPrompt);
  }
}
