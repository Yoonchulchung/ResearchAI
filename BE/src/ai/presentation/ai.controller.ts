import { Controller, Get, Post, Param, HttpCode } from '@nestjs/common';
import { AiProviderService } from '../application/ai-provider.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiProviderService: AiProviderService) {}

  @Get('ollama/running')
  async getRunningModels() {
    return this.aiProviderService.getRunningOllamaModels();
  }

  @Post('ollama/unload/:model')
  @HttpCode(200)
  async unloadModel(@Param('model') model: string) {
    await this.aiProviderService.unloadOllamaModel(model);
    return { model, unloaded: true };
  }
}
