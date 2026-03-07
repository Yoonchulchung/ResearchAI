export interface Task {
  id: number;
  title: string;
  icon: string;
  prompt: string;
}

export interface ItemWithResult extends Task {
  itemId: string;
  status: string;
  result: string | null;
}

export interface Session {
  id: string;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  researchState?: string;
  createdAt: string;
  summary?: string | null;
  items?: ItemWithResult[];
  doneCount?: number;
}
