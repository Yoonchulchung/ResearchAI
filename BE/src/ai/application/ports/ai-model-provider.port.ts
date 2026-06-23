import { AIProvider } from 'src/ai/domain/models';
import {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderCredentialMode,
  AiProviderStreamRequest,
} from 'src/ai/application/ai-provider.types';

/**
 * AI SDK와 application 계층 사이의 교체 가능한 경계입니다.
 *
 * 새 provider를 추가할 때 이 계약만 구현하면 됩니다. API key 해석, SDK client 생성,
 * provider 전용 model prefix와 요청 변환은 adapter 내부에 숨기고, 호출자는 이 계약만
 * 사용해야 특정 SDK의 타입과 구현 세부사항을 읽지 않아도 됩니다.
 */
export abstract class AiModelProviderPort {
  abstract readonly provider: AIProvider;

  /** 현재 요청에서 이 provider를 사용할 자격 증명이 있는지 검증합니다. */
  abstract assertConfigured(model: string): void;

  /** 동기형 AI 응답을 공통 결과 형식으로 변환합니다. */
  abstract call(request: AiProviderCallRequest): Promise<AiCallResult>;

  /** provider 고유 stream을 문자열 chunk로 통일합니다. */
  abstract stream(request: AiProviderStreamRequest): AsyncGenerator<string>;

  /** 시스템 기본 키를 이용한 fallback 가능 여부입니다. */
  isConfigured(mode: AiProviderCredentialMode = 'request'): boolean {
    void mode;
    return true;
  }

  /** 현재 요청이 사용자 키가 아닌 시스템 기본 키를 사용하는지 반환합니다. */
  isUsingDefaultCredential(): boolean {
    return false;
  }

  /** provider별 오류 형식에서 quota/rate-limit 여부를 판별합니다. */
  isRateLimitError(error: unknown): boolean {
    const message = (error as Error)?.message?.toLowerCase() ?? '';
    return (
      message.includes('429') ||
      message.includes('rate') ||
      message.includes('quota') ||
      message.includes('limit') ||
      message.includes('resource_exhausted')
    );
  }

  /** 로컬 provider가 설치된 모델을 노출할 때 구현합니다. */
  listModels(): Promise<{ name: string }[]> {
    return Promise.resolve([]);
  }

  /** 로컬 provider가 실행 중인 모델을 노출할 때 구현합니다. */
  getRunningModels(): Promise<
    { name: string; size: number; size_vram: number }[]
  > {
    return Promise.resolve([]);
  }

  /** 로컬 provider가 모델 unload를 지원할 때 구현합니다. */
  unloadModel(model: string): Promise<void> {
    return Promise.reject(
      new Error(
        `${this.provider} provider는 "${model}" 모델 unload를 지원하지 않습니다.`,
      ),
    );
  }
}
