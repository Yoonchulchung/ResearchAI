import { Logger } from '@nestjs/common';

export type JobChunkHandler = (chunk: string) => void;
export type JobLogHandler = (message: string) => void;

/**
 * 큐 잡 실행자의 공통 계약.
 *
 * 실행자마다 입력 형태가 다르므로 튜플 타입으로 인자를 보존한다.
 * Nest provider 등록은 구체 클래스가 담당하고, 이 클래스는 실행 계약과
 * 공통 로깅 기능만 제공한다.
 */
export abstract class BaseJobExecutor<
  TResult,
  TArguments extends unknown[] = [],
> {
  protected readonly logger: Logger;

  protected constructor(context: string) {
    this.logger = new Logger(context);
  }

  abstract execute(...args: TArguments): Promise<TResult>;
}

/**
 * 문자열 스트림을 소비하는 실행자의 공통 기반.
 * 청크 전달, 결과 누적, AbortSignal 확인을 한곳에서 처리한다.
 */
export abstract class StreamingJobExecutor<
  TArguments extends unknown[],
> extends BaseJobExecutor<string, TArguments> {
  protected async collectStream(
    stream: AsyncIterable<string>,
    onChunk: JobChunkHandler,
    signal?: AbortSignal,
  ): Promise<string> {
    let fullText = '';

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }

    return fullText;
  }
}
