import { Injectable } from '@nestjs/common';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import { AIProvider } from 'src/ai/domain/models';
import { InvalidAiTypeException } from 'src/shared/exceptions/invalid-ai-type.exception';
import { AnthropicProviderAdapter } from 'src/ai/infrastructure/provider/anthropic/anthropic-provider.adapter';
import { GoogleProviderAdapter } from 'src/ai/infrastructure/provider/google/google-provider.adapter';
import { GroqProviderAdapter } from 'src/ai/infrastructure/provider/groq/groq-provider.adapter';
import { LlamaCppProviderAdapter } from 'src/ai/infrastructure/provider/llama-cpp/llama-cpp-provider.adapter';
import { OllamaProviderAdapter } from 'src/ai/infrastructure/provider/ollama/ollama-provider.adapter';
import { OpenAiProviderAdapter } from 'src/ai/infrastructure/provider/openai/openai-provider.adapter';

/**
 * provider 선택 지점을 한 곳으로 제한합니다.
 * 새 adapter는 생성자 배열에 한 번만 등록하며, application 코드는 구체 클래스를 모릅니다.
 */
@Injectable()
export class AiProviderRegistry {
  private readonly providers: Map<AIProvider, AiModelProviderPort>;

  constructor(
    anthropic: AnthropicProviderAdapter,
    google: GoogleProviderAdapter,
    groq: GroqProviderAdapter,
    llamaCpp: LlamaCppProviderAdapter,
    ollama: OllamaProviderAdapter,
    openAi: OpenAiProviderAdapter,
  ) {
    this.providers = new Map(
      [anthropic, google, groq, llamaCpp, ollama, openAi].map((adapter) => [
        adapter.provider,
        adapter,
      ]),
    );
  }

  get(provider: AIProvider): AiModelProviderPort {
    const adapter = this.providers.get(provider);
    if (!adapter) throw new InvalidAiTypeException(provider);
    return adapter;
  }
}
