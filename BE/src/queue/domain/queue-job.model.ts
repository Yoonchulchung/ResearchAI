import { SearchSources } from '../../research/domain/model/search-sources.model';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';

export enum QueueJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
  STOPPED = 'stopped',
}

export enum QueueJobPhase {
  SEARCHING = 'searching',
  ANALYZING = 'analyzing',
}

export enum SseEventType {
  LOG   = 'log',
  CHUNK = 'chunk',
  DONE  = 'done',
  ERROR = 'error',
}

export namespace QueueJob {
  export enum TaskType {
    LIGHTRESEARCH          = 'lightresearch',
    DEEPRESEARCH           = 'deepresearch',
    SUMMARY                = 'summary',
    WRITEASSIST            = 'writeassist',           // 커스텀 자유 입력
    WRITEASSIST_EVALUATE   = 'writeassist_evaluate',
    WRITEASSIST_PLAGIARISM = 'writeassist_plagiarism',
    WRITEASSIST_CONTINUE   = 'writeassist_continue',
    WRITEASSIST_SECTION    = 'writeassist_section',
    WRITEASSIST_IMPROVE    = 'writeassist_improve',
    WRITEASSIST_SPELLCHECK = 'writeassist_spellcheck',
    WRITEASSIST_SUMMARIZE  = 'writeassist_summarize',
    WRITEASSIST_EXAMPLE    = 'writeassist_example',
    COMPANYPROFILE         = 'companyprofile',
    COMPANYANALYSIS        = 'companyanalysis',
    DOCPARSE_ASK           = 'docparse_ask',
    DOCPARSE_ACTION        = 'docparse_action',
    SPEC_ANALYSIS          = 'spec_analysis',
    TECH_BLOG_TREND        = 'tech_blog_trend',
    HOT_PAPER_SUMMARY      = 'hot_paper_summary',
  }

  export function isWriteAssist(type: TaskType): boolean {
    return type === TaskType.WRITEASSIST || type.startsWith('writeassist_');
  }
}

export interface QueueJob {
  jobId: string;
  sessionId: string;
  itemId: string;
  itemContent: string;
  taskType: QueueJob.TaskType;
  localAIModel: string;
  CloudAIModel: string;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  webSources?: SearchSources;
  result?: string;
  errorMessage?: string;
  webModel?: SearchEngine;
  searchMode?: string;
  filterModel?: string;
}
