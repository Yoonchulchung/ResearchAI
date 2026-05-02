import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../response/api-response';
import { GeneralSuccessCode } from '../response/success-code';

const SSE_METADATA = '__sse__'; // @nestjs/common 내부 상수

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // @Sse 엔드포인트: NestJS가 Observable<MessageEvent>를 직접 구독하므로 그대로 통과
    const isSse = this.reflector.get<boolean>(SSE_METADATA, context.getHandler());
    if (isSse) return next.handle();

    return next.handle().pipe(
      map((data) => {
        // 컨트롤러가 이미 ApiResponse를 반환한 경우 그대로 통과
        if (data instanceof ApiResponse) return data;
        return ApiResponse.onSuccess(GeneralSuccessCode.OK, data);
      }),
    );
  }
}
