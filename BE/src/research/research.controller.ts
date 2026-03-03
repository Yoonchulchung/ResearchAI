import { Controller, Get, Post, Body } from '@nestjs/common';
import { ResearchService } from './research.service';

@Controller('research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get('models')
  getModels() {
    return this.researchService.getModels();
  }

  @Post()
  runResearch(@Body() body: { prompt: string; model: string }) {
    return this.researchService.runResearch(body.prompt, body.model);
  }

  @Post('generate-tasks')
  generateTasks(@Body() body: { topic: string; model: string }) {
    return this.researchService.generateTasks(body.topic, body.model);
  }
}
