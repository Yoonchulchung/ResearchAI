export interface SuccessCode {
  readonly code: string;
  readonly message: string;
}

export const GeneralSuccessCode = {
  OK:      { code: '2000', message: '요청에 성공하였습니다.' },
  CREATED: { code: '2001', message: '정상적으로 생성되었습니다.' },
} as const satisfies Record<string, SuccessCode>;
