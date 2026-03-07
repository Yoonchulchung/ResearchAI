import { Session, TaskWithResult } from '../../../domain/session.model';

export class TaskResponseDto {
  id: number;
  title: string;
  icon: string;
  prompt: string;
  result: string | null;

  static from(task: TaskWithResult): TaskResponseDto {
    const dto = new TaskResponseDto();
    dto.id = task.id;
    dto.title = task.title;
    dto.icon = task.icon;
    dto.prompt = task.prompt;
    dto.result = task.result;
    return dto;
  }
}

export class SessionResponseDto {
  id: string;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  researchState?: string;
  createdAt: string;
  summary?: string | null;
  tasks?: TaskResponseDto[];
  doneCount?: number;

  static from(session: Session): SessionResponseDto {
    const dto = new SessionResponseDto();
    dto.id = session.id;
    dto.topic = session.topic;
    dto.researchCloudAIModel = session.researchCloudAIModel;
    dto.researchLocalAIModel = session.researchLocalAIModel;
    dto.researchWebModel = session.researchWebModel;
    dto.researchState = session.researchState;
    dto.createdAt = session.createdAt;
    dto.summary = session.summary;
    dto.tasks = session.tasks?.map(TaskResponseDto.from);
    dto.doneCount = session.doneCount;
    return dto;
  }
}
