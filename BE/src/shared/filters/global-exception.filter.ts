import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BrokenCircuitError } from 'cockatiel';
import { Request, Response } from 'express';
import { UndefinedAiAPIException } from '../exceptions/undefined-ai-api.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { status, message } = this.resolveException(exception);

    if (status >= 500) {
      this.logger.error(`[${request.method}] ${request.url} → ${status}`, exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveException(exception: unknown): { status: number; message: string | object } {
    
    if (exception instanceof UndefinedAiAPIException) {
      return { 
        status: exception.status, 
        message: exception.message 
      };
    }

    if (exception instanceof BrokenCircuitError) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: '외부 서비스가 일시적으로 사용 불가능합니다. 잠시 후 다시 시도해주세요.' };
    }

    if (exception instanceof HttpException) {
      return { status: exception.getStatus(), message: exception.getResponse() };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: '서버 내부 오류가 발생했습니다.' };
  }
}
