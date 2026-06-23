import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderStreamRequest,
} from 'src/ai/application/ai-provider.types';
import { AIProvider } from 'src/ai/domain/models';
import {
  callGoogle,
  streamGoogle,
} from 'src/ai/infrastructure/provider/google/google.ai';
import {
  DEFAULT_GOOGLE_API_KEY,
  requestContext,
} from 'src/shared/request-context';
import { UndefinedAiAPIException } from 'src/shared/exceptions/undefined-ai-api.exception';

class DefaultGoogleRateLimiter {
  private readonly minIntervalMs: number;
  private lastCallMs = 0;
  private readonly queue: Array<() => void> = [];
  private processing = false;

  constructor(rpm = 12) {
    this.minIntervalMs = Math.ceil(60_000 / rpm);
  }

  wait(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (!this.processing) this.flush();
    });
  }

  private flush(): void {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    this.processing = true;
    const delay = Math.max(
      0,
      this.lastCallMs + this.minIntervalMs - Date.now(),
    );
    setTimeout(() => {
      this.lastCallMs = Date.now();
      this.queue.shift()?.();
      this.flush();
    }, delay);
  }
}

@Injectable()
export class GoogleProviderAdapter extends AiModelProviderPort {
  readonly provider = AIProvider.GOOGLE;
  private readonly defaultLimiter = new DefaultGoogleRateLimiter(12);

  assertConfigured(model: string): void {
    void model;
    if (this.isConfigured()) return;
    throw new UndefinedAiAPIException(
      'Google API 키가 설정되지 않았습니다. [설정 → Overview]에서 키를 입력해주세요.',
    );
  }

  isConfigured(): boolean {
    return Boolean(
      requestContext.getStore()?.apiKeys.googleApiKey?.trim() ||
      DEFAULT_GOOGLE_API_KEY(),
    );
  }

  isUsingDefaultCredential(): boolean {
    return !requestContext.getStore()?.apiKeys.googleApiKey?.trim();
  }

  async call(request: AiProviderCallRequest): Promise<AiCallResult> {
    await this.throttleDefaultCredential();
    return callGoogle(
      this.getClient(),
      request.model,
      `${request.system}\n\n${request.promptText}`,
      request.useBuiltinSearch,
    );
  }

  async *stream(request: AiProviderStreamRequest): AsyncGenerator<string> {
    await this.throttleDefaultCredential();
    yield* streamGoogle(
      this.getClient(),
      request.model,
      request.system,
      request.messages,
    );
  }

  private async throttleDefaultCredential(): Promise<void> {
    if (this.isUsingDefaultCredential()) await this.defaultLimiter.wait();
  }

  private getClient(): GoogleGenAI {
    const key =
      requestContext.getStore()?.apiKeys.googleApiKey?.trim() ||
      DEFAULT_GOOGLE_API_KEY();
    if (key) return new GoogleGenAI({ apiKey: key });
    throw new UndefinedAiAPIException(
      'Google API 키가 설정되지 않았습니다. [설정 → Overview]에서 키를 입력해주세요.',
    );
  }
}
