import { Controller, Get, Post, Param, Body, HttpCode } from '@nestjs/common';
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

  @Post('improve-task')
  @HttpCode(200)
  async improveTask(
    @Body() body: { topic: string; title: string; prompt: string; model: string },
  ) {
    return this.aiProviderService.improveTask(body.topic, body.title, body.prompt, body.model);
  }

  @Post('chat-tasks')
  @HttpCode(200)
  async chatTasks(
    @Body()
    body: {
      topic: string;
      tasks: Array<{ id: number; title: string; icon: string; webSearchPrompt: string }>;
      message: string;
      model: string;
      history: Array<{ role: string; content: string }>;
    },
  ) {
    return this.aiProviderService.chatTasks(
      body.topic,
      body.tasks,
      body.message,
      body.model,
      body.history ?? [],
    );
  }
}
