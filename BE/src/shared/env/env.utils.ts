export const API_KEY_PLACEHOLDER_PREFIX = 'your_';

/** 환경변수 값이 실제로 설정되어 있는지 확인 (플레이스홀더 값 제외) */
export const isEnvKeySet = (key: string | undefined): key is string =>
  !!(key && !key.startsWith(API_KEY_PLACEHOLDER_PREFIX));
