import { SearchSources } from '../../research/domain/model/search-sources.model';

export type QueueJobStatus = 'pending' | 'running' | 'done' | 'error';
export type QueueJobPhase = 'searching' | 'analyzing';

export namespace QueueJob {
  export enum TaskType {
    DEEPRESEARCH = 'deepresearch',
  }
}

export interface QueueJob {
  jobId: string;
  sessionId: string;
  itemId: string;
  taskPrompt: string;
  taskType: QueueJob.TaskType;
  model: string;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  sources?: SearchSources;
  result?: string;
}
