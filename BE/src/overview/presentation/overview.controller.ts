import { Controller, Get } from '@nestjs/common';
import { OverviewService } from '../application/overview.service';

@Controller('overview')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get('prompts')
  getPromptTemplates() {
    return this.overviewService.getPromptTemplates();
  }

  @Get('pipeline-status')
  getPipelineStatus() {
    return this.overviewService.getPipelineStatus();
  }

  @Get('tavily')
  getTavilyOverview() {
    return this.overviewService.getTavilyOverview();
  }

  @Get('anthropic/usage')
  getAnthropicUsage() {
    return this.overviewService.getAnthropicUsage();
  }
}
