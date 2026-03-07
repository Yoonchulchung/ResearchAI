export interface Task {
  id: number;
  title: string;
  icon: string;
  prompt: string;
}

export interface TaskWithResult extends Task {
  result: string | null;
}

export interface Session {
  id: string;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  createdAt: string;
  summary?: string | null;
  tasks?: TaskWithResult[];
  doneCount?: number;
}
