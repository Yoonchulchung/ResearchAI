export interface ErrorCode {
  readonly httpStatus: number;
  readonly code: string;
  readonly message: string;
}

export const GeneralErrorCode = {
  BAD_REQUEST:            { httpStatus: 400, code: '4000', message: '잘못된 요청입니다.' },
  UNAUTHORIZED:           { httpStatus: 401, code: '4001', message: '인증이 필요합니다.' },
  FORBIDDEN:              { httpStatus: 403, code: '4003', message: '접근 권한이 없습니다.' },
  NOT_FOUND:              { httpStatus: 404, code: '4004', message: '요청한 리소스를 찾을 수 없습니다.' },
  INTERNAL_SERVER_ERROR:  { httpStatus: 500, code: '5000', message: '서버 내부 오류가 발생했습니다.' },
  SERVICE_UNAVAILABLE:    { httpStatus: 503, code: '5003', message: '외부 서비스가 일시적으로 사용 불가능합니다. 잠시 후 다시 시도해주세요.' },
} as const satisfies Record<string, ErrorCode>;
