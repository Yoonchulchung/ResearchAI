import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BrokenCircuitError } from 'cockatiel';
import { Request, Response } from 'express';
import { UndefinedAiAPIException } from '../exceptions/undefined-ai-api.exception';
import { ApiResponse } from '../response/api-response';
import { ErrorCode, GeneralErrorCode } from '../response/error-code';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { errorCode, message } = this.resolveException(exception);

    if (errorCode.httpStatus >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${errorCode.httpStatus}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(errorCode.httpStatus).json(ApiResponse.onFailure(errorCode, message));
  }

  private resolveException(exception: unknown): { errorCode: ErrorCode; message: string } {
    if (exception instanceof UndefinedAiAPIException) {
      return {
        errorCode: this.httpStatusToErrorCode(exception.status),
        message: exception.message,
      };
    }

    if (exception instanceof BrokenCircuitError) {
      return { errorCode: GeneralErrorCode.SERVICE_UNAVAILABLE, message: GeneralErrorCode.SERVICE_UNAVAILABLE.message };
    }

    if (exception instanceof HttpException) {
      return {
        errorCode: this.httpStatusToErrorCode(exception.getStatus()),
        message: this.extractHttpMessage(exception),
      };
    }

    return { errorCode: GeneralErrorCode.INTERNAL_SERVER_ERROR, message: GeneralErrorCode.INTERNAL_SERVER_ERROR.message };
  }

  private extractHttpMessage(exception: HttpException): string {
    const res = exception.getResponse();
    if (typeof res === 'string') return res;

    const body = res as Record<string, unknown>;
    const msg = body.message;

    if (Array.isArray(msg)) return (msg as string[]).join(', ');
    if (typeof msg === 'string') return msg;

    return exception.message;
  }

  private httpStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:    return GeneralErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:       return GeneralErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:       return GeneralErrorCode.NOT_FOUND;
      case HttpStatus.SERVICE_UNAVAILABLE: return GeneralErrorCode.SERVICE_UNAVAILABLE;
      default:
        if (status >= 500) return GeneralErrorCode.INTERNAL_SERVER_ERROR;
        return GeneralErrorCode.BAD_REQUEST;
    }
  }
}
