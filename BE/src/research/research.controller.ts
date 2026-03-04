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

  @Post('test/generate-tasks')
  testGenerateTasks(@Body() body: { topic: string; model: string }) {
    return this.researchService.testGenerateTasks(body.topic, body.model);
  }
}
