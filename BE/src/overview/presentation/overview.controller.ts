import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { OverviewService } from '../application/overview.service';
import { CreateApiKeyDto } from './dto/request/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/request/update-api-key.dto';

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

  @Get('analytics')
  getAnalytics(@Query('range') range = '30d') {
    return this.overviewService.getAnalytics(range);
  }

  @Get('logs')
  getLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.overviewService.getLogs(
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, Math.max(1, parseInt(limit, 10) || 10)),
    );
  }

  // ******************************** //
  // API Key - Needs to be deprecated //
  // ******************************** //
  @Get('api-keys')
  getApiKeys() {
    return this.overviewService.getApiKeys();
  }

  @Put('api-keys')
  updateApiKey(@Body() body: { key: string; value: string }) {
    return this.overviewService.updateApiKey(body.key, body.value);
  }

  // ******* //
  // API Key //
  // ******* //
  @Get('stored-keys')
  getStoredApiKeys() {
    return this.overviewService.getStoredApiKeys();
  }

  @Get('stored-keys/:id')
  getStoredApiKey(@Param('id') id: string) {
    return this.overviewService.getStoredApiKey(id);
  }

  @Post('stored-keys')
  createStoredApiKey(@Body() body: CreateApiKeyDto) {
    return this.overviewService.createStoredApiKey(body.apiName, body.key);
  }

  @Patch('stored-keys/:id')
  updateStoredApiKey(@Param('id') id: string, @Body() body: UpdateApiKeyDto) {
    return this.overviewService.updateStoredApiKey(id, body.apiName, body.key);
  }

  @Delete('stored-keys/:id')
  deleteStoredApiKey(@Param('id') id: string) {
    return this.overviewService.deleteStoredApiKey(id);
  }
}
