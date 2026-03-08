import { SearchSources } from '../../research/domain/model/search-sources.model';

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

export namespace QueueJob {
  export enum TaskType {
    DEEPRESEARCH = 'deepresearch',
  }
}

export interface QueueJob {
  jobId: string;
  sessionId: string;
  itemId: string;
  itemPrompt: string;
  taskType: QueueJob.TaskType;
  model: string;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  sources?: SearchSources;
  result?: string;
}
