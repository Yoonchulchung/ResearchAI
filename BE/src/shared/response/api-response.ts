import { GeneralSuccessCode, SuccessCode } from './success-code';
import { ErrorCode } from './error-code';

export class ApiResponse<T = null> {
  readonly isSuccess: boolean;
  readonly code: string;
  readonly message: string;
  readonly result: T;

  private constructor(isSuccess: boolean, code: string, message: string, result: T) {
    this.isSuccess = isSuccess;
    this.code = code;
    this.message = message;
    this.result = result;
  }

  static onSuccess<T>(successCode: SuccessCode, result: T): ApiResponse<T> {
    return new ApiResponse(true, successCode.code, successCode.message, result);
  }

  static ok<T>(result: T): ApiResponse<T> {
    return ApiResponse.onSuccess(GeneralSuccessCode.OK, result);
  }

  static onFailure(errorCode: ErrorCode, message?: string): ApiResponse<null> {
    return new ApiResponse(false, errorCode.code, message ?? errorCode.message, null);
  }
}
