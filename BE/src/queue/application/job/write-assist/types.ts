export interface WriteAssistExtras {
  /** WRITEASSIST(커스텀) 전용 — 사용자가 자유 입력한 지시 */
  instruction?: string;
  /** 함께 참고할 지원자의 경험 항목들 */
  experiences?: { title: string; content: string }[];
  /** 지원 기업 정보 — 평가·작성 컨텍스트 */
  companyCtx?: string;
  /** 이전 채팅 히스토리 — 대화 연속성 유지 */
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** 이미지 파일명 목록 (BE IMAGE_CACHE_DIR 기준) — vision 분석 시 사용 */
  imageFiles?: string[];
}

/** 글 평가 — 문항 유형 (AI Agent 1단계에서 분류) */
export type QuestionType = 'motivation' | 'experience' | 'competency' | 'personality' | 'general';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  motivation: '지원 동기',
  experience: '경험 서술',
  competency: '직무 역량',
  personality: '인성·행동',
  general: '일반 자기소개',
};
