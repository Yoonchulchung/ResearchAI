import { SearchSources } from '../../research/domain/model/search-sources.model';

export type QueueJobStatus = 'pending' | 'running' | 'done' | 'error';
export type QueueJobPhase = 'searching' | 'analyzing';

export interface QueueJob {
  jobId: string;
  sessionId: string;
  sessionTopic: string;
  taskId: number;
  taskTitle: string;
  taskIcon: string;
  taskPrompt: string;
  model: string;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  sources?: SearchSources;
  result?: string;
}
