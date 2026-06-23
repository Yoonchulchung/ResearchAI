import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderCredentialMode,
  AiProviderStreamRequest,
} from 'src/ai/application/ai-provider.types';
import { AI_MODEL_PREFIX, AIProvider } from 'src/ai/domain/models';
import {
  callGroq,
  streamGroq,
} from 'src/ai/infrastructure/provider/groq/groq.ai';
import {
  DEFAULT_GROQ_API_KEY,
  requestContext,
} from 'src/shared/request-context';
import { UndefinedAiAPIException } from 'src/shared/exceptions/undefined-ai-api.exception';

@Injectable()
export class GroqProviderAdapter extends AiModelProviderPort {
  readonly provider = AIProvider.GROQ;

  assertConfigured(model: string): void {
    if (this.isConfigured()) return;
    throw new UndefinedAiAPIException(
      `Groq API 키가 설정되지 않아 "${model}" 모델을 사용할 수 없습니다. ` +
        '[설정 → Overview]에서 본인의 Groq 키를 입력해주세요.',
    );
  }

  isConfigured(mode: AiProviderCredentialMode = 'request'): boolean {
    const requestKey = requestContext.getStore()?.apiKeys.groqApiKey?.trim();
    return Boolean(
      mode === 'default'
        ? DEFAULT_GROQ_API_KEY()
        : requestKey || DEFAULT_GROQ_API_KEY(),
    );
  }

  call(request: AiProviderCallRequest): Promise<AiCallResult> {
    return callGroq(
      this.getApiKey(request.credentialMode),
      this.normalizeModel(request.model),
      request.system,
      request.messages as OpenAI.ChatCompletionMessageParam[],
      request.tools as OpenAI.ChatCompletionTool[] | undefined,
      request.signal,
    );
  }

  stream(request: AiProviderStreamRequest): AsyncGenerator<string> {
    return streamGroq(
      this.getApiKey(request.credentialMode),
      this.normalizeModel(request.model),
      request.system,
      request.messages,
    );
  }

  private normalizeModel(model: string): string {
    return model.startsWith(AI_MODEL_PREFIX.GROQ)
      ? model.slice(AI_MODEL_PREFIX.GROQ.length)
      : model;
  }

  private getApiKey(mode: AiProviderCredentialMode = 'request'): string {
    const requestKey = requestContext.getStore()?.apiKeys.groqApiKey?.trim();
    const key =
      mode === 'default'
        ? DEFAULT_GROQ_API_KEY()
        : requestKey || DEFAULT_GROQ_API_KEY();
    if (key) return key;
    throw new UndefinedAiAPIException(
      'Groq API 키가 설정되지 않았습니다. Overview 설정에서 키를 입력해주세요.',
    );
  }
}
