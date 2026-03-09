import { SearchSources } from '../../research/domain/model/search-sources.model';
import { SearchEngine } from '../../research/application/search-planner.service';

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
    LIGHTRESEARCH = 'lightresearch',
    DEEPRESEARCH = 'deepresearch',
    SUMMARY = 'summary',
  }
}

export interface QueueJob {
  jobId: string;
  sessionId: string;
  itemId: string;
  itemPrompt: string;
  taskType: QueueJob.TaskType;
  localAIModel: string;
  CloudAIModel: string;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  webSources?: SearchSources;
  result?: string;
  webModel?: SearchEngine;
  searchMode?: string;
}
