import { QueueJobStatus, QueueJobPhase, QueueJob } from '../../../domain/queue-job.model';
import { SearchSources } from '../../../../research/domain/model/search-sources.model';

export class QueueJobSummaryDto {
  jobId: string;
  sessionId: string;
  itemId: string;
  taskType: QueueJob.TaskType;
  status: QueueJobStatus;
  phase?: QueueJobPhase;
  displayTitle?: string;
  displaySubtitle?: string;
  webSources?: SearchSources;
  referenceCount?: number;
}

export class QueueStatusDto {
  running: boolean;
  total: number;
  pending: number;
  running_jobs: number;
  done: number;
  error: number;
  stopped: number;
  jobs: QueueJobSummaryDto[];
}
