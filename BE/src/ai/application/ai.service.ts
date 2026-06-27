import { Injectable } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { AiAgenticImplService } from 'src/ai/application/agentic/ai-agentic-impl.service';
import { AiTaskImplService } from 'src/ai/application/task/ai-task-impl.service';
import { AiWritingImplService } from 'src/ai/application/writing/ai-writing-impl.service';

@Injectable()
export class AiService {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly agentic: AiAgenticImplService,
    private readonly task: AiTaskImplService,
    private readonly writing: AiWritingImplService,
  ) {}

  call(
    aiModel: string,
    system: string,
    prompt: string,
    opts?: { useBuiltinSearch?: boolean },
  ): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
  }> {
    return this.aiProvider.call(aiModel, system, prompt, opts);
  }

  runAgenticLoop(
    aiModel: string,
    system: string,
    prompt: string,
    searchFn: (query: string) => Promise<string>,
    maxIterations = 5,
    signal?: AbortSignal,
    extraTools?: { anthropic: object[]; openai: object[] },
    toolHandlers?: Record<
      string,
      (input: unknown) => Promise<{ text: string; data?: unknown }>
    >,
  ): Promise<{
    result: string;
    searchLog: Array<{ query: string; result: string }>;
    toolData: Record<string, unknown[]>;
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
  }> {
    return this.agentic.runAgenticLoop(
      aiModel,
      system,
      prompt,
      searchFn,
      maxIterations,
      signal,
      extraTools,
      toolHandlers,
    );
  }

  evaluateConfidence(
    answer: string,
    context: string,
    model: string,
  ): Promise<{ score: number; reason: string }> {
    return this.task.evaluateConfidence(answer, context, model);
  }

  improveTask(
    topic: string,
    title: string,
    prompt: string,
    model: string,
  ): Promise<{ title: string; prompt: string }> {
    return this.task.improveTask(topic, title, prompt, model);
  }

  writeAssist(
    content: string,
    instruction: string,
    model: string,
  ): Promise<{ result: string }> {
    return this.writing.writeAssist(content, instruction, model);
  }

  generateTitle(
    topic: string,
    tasks: Array<{ title: string }>,
    model: string,
  ): Promise<{ title: string }> {
    return this.task.generateTitle(topic, tasks, model);
  }

  chatTasks(
    topic: string,
    tasks: Array<{ id: number; title: string; webSearchPrompt: string }>,
    message: string,
    model: string,
    history: Array<{ role: string; content: string }>,
  ): Promise<{
    tasks: Array<{ id: number; title: string; webSearchPrompt: string }>;
    reply: string;
  }> {
    return this.task.chatTasks(topic, tasks, message, model, history);
  }
}
