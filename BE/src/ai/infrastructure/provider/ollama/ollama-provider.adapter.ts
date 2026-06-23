import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderStreamRequest,
} from 'src/ai/application/ai-provider.types';
import { AI_MODEL_PREFIX, AIProvider } from 'src/ai/domain/models';
import {
  callOllama,
  getOllamaLocalModels,
  getOllamaRunningModels,
  OllamaInsufficientMemoryError,
  OllamaTool,
  streamOllama,
  unloadOllamaModel,
} from 'src/ai/infrastructure/provider/ollama/ollama.ai';

@Injectable()
export class OllamaProviderAdapter extends AiModelProviderPort {
  readonly provider = AIProvider.OLLAMA;
  private readonly logger = new Logger(OllamaProviderAdapter.name);

  assertConfigured(model: string): void {
    void model;
  }

  async call(request: AiProviderCallRequest): Promise<AiCallResult> {
    const model = this.normalizeModel(request.model);
    try {
      if (request.tools?.length) {
        const result = await callOllama(
          model,
          request.system,
          request.messages,
          undefined,
          undefined,
          request.tools as OllamaTool[],
          undefined,
          request.signal,
        );
        const toolCalls = result.toolCalls.map((toolCall) => ({
          id: randomUUID(),
          name: toolCall.function.name,
          input: toolCall.function.arguments as Record<string, unknown>,
        }));
        return {
          text: result.content,
          inputTokens: 0,
          outputTokens: 0,
          toolCalls,
          stopReason: toolCalls.length ? 'tool_use' : 'end_turn',
        };
      }

      const text = await callOllama(
        model,
        request.system,
        request.promptText,
        undefined,
        undefined,
        undefined,
        undefined,
        request.signal,
      );
      return { text, inputTokens: 0, outputTokens: 0 };
    } catch (error) {
      this.logError('호출', model, error);
      throw error;
    }
  }

  async *stream(request: AiProviderStreamRequest): AsyncGenerator<string> {
    const model = this.normalizeModel(request.model);
    try {
      yield* streamOllama(model, request.system, request.messages);
    } catch (error) {
      this.logError('스트림', model, error);
      throw error;
    }
  }

  listModels(): Promise<{ name: string }[]> {
    return getOllamaLocalModels();
  }

  getRunningModels(): Promise<
    { name: string; size: number; size_vram: number }[]
  > {
    return getOllamaRunningModels();
  }

  unloadModel(model: string): Promise<void> {
    return unloadOllamaModel(model);
  }

  private normalizeModel(model: string): string {
    return model.slice(AI_MODEL_PREFIX.OLLAMA.length);
  }

  private logError(action: string, model: string, error: unknown): void {
    const label =
      error instanceof OllamaInsufficientMemoryError
        ? '메모리 부족'
        : `Ollama ${action} 오류`;
    this.logger.error(
      `[${label}] model=${model} | ${(error as Error).message}`,
    );
  }
}
