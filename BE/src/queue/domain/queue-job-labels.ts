import { QueueJob } from './queue-job.model';

export const QUEUE_JOB_LABELS: Partial<Record<QueueJob.TaskType, string>> = {
  [QueueJob.TaskType.LIGHTRESEARCH]: 'Light Research',
  [QueueJob.TaskType.DEEPRESEARCH]: 'Deep Research',
  [QueueJob.TaskType.SUMMARY]: '요약',
  [QueueJob.TaskType.WRITEASSIST]: '작성 보조',
  [QueueJob.TaskType.WRITEASSIST_EVALUATE]: '평가',
  [QueueJob.TaskType.WRITEASSIST_PLAGIARISM]: '표절 검사',
  [QueueJob.TaskType.WRITEASSIST_CONTINUE]: '이어쓰기',
  [QueueJob.TaskType.WRITEASSIST_SECTION]: '문단 작성',
  [QueueJob.TaskType.WRITEASSIST_IMPROVE]: '개선',
  [QueueJob.TaskType.WRITEASSIST_SPELLCHECK]: '맞춤법',
  [QueueJob.TaskType.WRITEASSIST_SUMMARIZE]: '요약',
  [QueueJob.TaskType.WRITEASSIST_EXAMPLE]: '예시 생성',
  [QueueJob.TaskType.WRITEASSIST_JD_EVALUATE]: 'JD 분석',
  [QueueJob.TaskType.COMPANYPROFILE]: '기업 프로필',
  [QueueJob.TaskType.COMPANYANALYSIS]: '기업 분석',
  [QueueJob.TaskType.DOCPARSE_ASK]: '문서 질문',
  [QueueJob.TaskType.DOCPARSE_ACTION]: '문서 분석',
  [QueueJob.TaskType.SPEC_ANALYSIS]: '스펙 분석',
  [QueueJob.TaskType.TECH_BLOG_TREND]: 'AI 트렌드 분석',
  [QueueJob.TaskType.PAPER_SUMMARY]: '논문 AI 요약',
  [QueueJob.TaskType.PAPER_TREND]: '논문 트렌드 분석',
  [QueueJob.TaskType.NEWS_ARTICLE_SUMMARY]: '뉴스 AI 요약',
  [QueueJob.TaskType.RESUME_COVER_LETTER_CATEGORY]: '자기소개서 카테고리 분류',
  [QueueJob.TaskType.RESUME_COVER_LETTER_REFINED_TITLE]:
    '자기소개서 제목 재작성',
  [QueueJob.TaskType.ROADMAP_ANALYSIS]: '사업 로드맵 분석',
  [QueueJob.TaskType.IMAGE_OCR]: '이미지 OCR',
  [QueueJob.TaskType.BULK_FETCH_NEWS]: '뉴스 대량 수집',
};

export function getQueueJobLabel(taskType: QueueJob.TaskType): string {
  return QUEUE_JOB_LABELS[taskType] ?? taskType;
}
