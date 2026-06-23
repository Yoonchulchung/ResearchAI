import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderCredentialMode,
  AiProviderStreamRequest,
} from 'src/ai/application/ai-provider.types';
import { AIProvider } from 'src/ai/domain/models';
import {
  callAnthropic,
  streamAnthropic,
} from 'src/ai/infrastructure/provider/anthropic/anthropic.ai';
import { requestContext } from 'src/shared/request-context';
import { UndefinedAiAPIException } from 'src/shared/exceptions/undefined-ai-api.exception';

@Injectable()
export class AnthropicProviderAdapter extends AiModelProviderPort {
  readonly provider = AIProvider.ANTHROPIC;

  assertConfigured(model: string): void {
    if (this.isConfigured('default')) return;
    throw new UndefinedAiAPIException(
      `Anthropic API 키가 설정되지 않아 "${model}" 모델을 사용할 수 없습니다. ` +
        '[설정 → Overview]에서 본인의 Anthropic 키를 입력하거나, 무료 Gemini 모델을 선택하세요.',
    );
  }

  isConfigured(mode: AiProviderCredentialMode = 'request'): boolean {
    const requestKey = requestContext
      .getStore()
      ?.apiKeys.anthropicApiKey?.trim();
    return Boolean(
      mode === 'default'
        ? requestKey || process.env.ANTHROPIC_API_KEY?.trim()
        : requestKey,
    );
  }

  call(request: AiProviderCallRequest): Promise<AiCallResult> {
    return callAnthropic(
      this.getClient(request.credentialMode),
      request.model,
      request.system,
      request.messages as Anthropic.MessageParam[],
      request.useBuiltinSearch,
      request.tools as Anthropic.Tool[] | undefined,
      request.signal,
    );
  }

  stream(request: AiProviderStreamRequest): AsyncGenerator<string> {
    return streamAnthropic(
      this.getClient(request.credentialMode),
      request.model,
      request.system,
      request.messages,
    );
  }

  private getClient(mode: AiProviderCredentialMode = 'request'): Anthropic {
    const requestKey = requestContext
      .getStore()
      ?.apiKeys.anthropicApiKey?.trim();
    const key =
      mode === 'default'
        ? requestKey || process.env.ANTHROPIC_API_KEY?.trim()
        : requestKey;
    if (key) return new Anthropic({ apiKey: key });
    throw new UndefinedAiAPIException(
      'Anthropic API 키가 설정되지 않았습니다. Overview 설정에서 키를 입력해주세요.',
    );
  }
}
