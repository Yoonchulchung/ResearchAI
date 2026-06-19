export type ExamEventGroup = 'apply' | 'test' | 'result' | string;

export interface ExamEvent {
  id: string;
  source: 'dataq';
  groupId: ExamEventGroup;
  phase: string;
  title: string;
  shortTitle: string;
  start: string;
  end: string;
  examOperationSeq: number | null;
  description: string;
  sourceUrl: string;
  collectedAt: string;
}

export interface ExamEventListResult {
  items: ExamEvent[];
  total: number;
  fetchedAt: string | null;
  errors: string[];
}
