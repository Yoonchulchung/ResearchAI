import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderStreamRequest,
} from 'src/ai/application/ai-provider.types';
import { AIProvider } from 'src/ai/domain/models';
import {
  callOpenAI,
  streamOpenAI,
} from 'src/ai/infrastructure/provider/openai/openai.ai';
import { requestContext } from 'src/shared/request-context';
import { UndefinedAiAPIException } from 'src/shared/exceptions/undefined-ai-api.exception';

@Injectable()
export class OpenAiProviderAdapter extends AiModelProviderPort {
  readonly provider = AIProvider.OPENAI;

  assertConfigured(model: string): void {
    if (this.isConfigured('default')) return;
    throw new UndefinedAiAPIException(
      `OpenAI API 키가 설정되지 않아 "${model}" 모델을 사용할 수 없습니다. ` +
        '[설정 → Overview]에서 본인의 OpenAI 키를 입력하거나, 무료 Gemini 모델을 선택하세요.',
    );
  }

  isConfigured(mode: 'request' | 'default' = 'default'): boolean {
    const requestKey = requestContext.getStore()?.apiKeys.openaiApiKey?.trim();
    return Boolean(
      mode === 'default'
        ? requestKey || process.env.OPENAI_API_KEY?.trim()
        : requestKey,
    );
  }

  call(request: AiProviderCallRequest): Promise<AiCallResult> {
    return callOpenAI(
      this.getClient(),
      request.model,
      request.system,
      request.messages as OpenAI.ChatCompletionMessageParam[],
      request.tools as OpenAI.ChatCompletionTool[] | undefined,
      request.signal,
    );
  }

  stream(request: AiProviderStreamRequest): AsyncGenerator<string> {
    return streamOpenAI(
      this.getClient(),
      request.model,
      request.system,
      request.messages,
    );
  }

  private getClient(mode: 'request' | 'default' = 'default'): OpenAI {
    const requestKey = requestContext.getStore()?.apiKeys.openaiApiKey?.trim();
    const key =
      mode === 'default'
        ? requestKey || process.env.OPENAI_API_KEY?.trim()
        : requestKey;
    if (key) return new OpenAI({ apiKey: key });
    throw new UndefinedAiAPIException(
      'OpenAI API 키가 설정되지 않았습니다. Overview 설정에서 키를 입력해주세요.',
    );
  }
}
