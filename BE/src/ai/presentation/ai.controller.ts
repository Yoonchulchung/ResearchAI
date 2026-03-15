import { Controller, Get, Post, Param, Body, HttpCode } from '@nestjs/common';
import { AiProviderService } from '../application/ai-provider.service';
import { SessionItemQueryService } from '../../sessions/application/query/session-item-query.service';
import { SessionItemCommandService } from '../../sessions/application/command/session-item-command.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly sessionItemQueryService: SessionItemQueryService,
    private readonly sessionItemCommandService: SessionItemCommandService,
  ) {}

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

  @Post('re-evaluate-confidence')
  @HttpCode(200)
  async reEvaluateConfidence(
    @Body() body: { itemId: string; model: string },
  ) {
    const item = await this.sessionItemQueryService.findById(body.itemId);
    const confidence = await this.aiProviderService.evaluateConfidence(
      item.aiResult ?? '',
      item.webResult ?? '',
      body.model,
    );
    await this.sessionItemCommandService.updateConfidence(body.itemId, confidence);
    return confidence;
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
