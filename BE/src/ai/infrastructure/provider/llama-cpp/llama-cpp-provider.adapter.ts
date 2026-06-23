import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderStreamRequest,
} from 'src/ai/application/ai-provider.types';
import { AI_MODEL_PREFIX, AIProvider } from 'src/ai/domain/models';
import {
  getLlamaCppClient,
  getLlamaCppModels,
} from 'src/ai/infrastructure/provider/llama-cpp/llama-cpp.ai';
import {
  callOpenAI,
  streamOpenAI,
} from 'src/ai/infrastructure/provider/openai/openai.ai';

@Injectable()
export class LlamaCppProviderAdapter extends AiModelProviderPort {
  readonly provider = AIProvider.LLAMA_CPP;

  assertConfigured(model: string): void {
    void model;
  }

  call(request: AiProviderCallRequest): Promise<AiCallResult> {
    return callOpenAI(
      getLlamaCppClient(),
      this.normalizeModel(request.model),
      request.system,
      request.messages as OpenAI.ChatCompletionMessageParam[],
      request.tools as OpenAI.ChatCompletionTool[] | undefined,
      request.signal,
    );
  }

  stream(request: AiProviderStreamRequest): AsyncGenerator<string> {
    return streamOpenAI(
      getLlamaCppClient(),
      this.normalizeModel(request.model),
      request.system,
      request.messages,
    );
  }

  listModels(): Promise<{ name: string }[]> {
    return getLlamaCppModels();
  }

  private normalizeModel(model: string): string {
    return model.slice(AI_MODEL_PREFIX.LLAMA_CPP.length);
  }
}
