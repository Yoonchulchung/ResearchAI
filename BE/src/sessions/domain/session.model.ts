export interface Task {
  id: number;
  title: string;
  icon: string;
  webSearchPrompt: string;
}

export interface ItemWithResult extends Task {
  itemId: string;
  status: string;
  researchState?: string;
  webResult: string | null;
  webModel: string;
  result: string | null;
  confidenceScore: number | null;
  confidenceReason: string | null;
}

export interface Session {
  id: string;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  researchState?: string;
  summaryState?: string | null;
  createdAt: string;
  summary?: string | null;
  items?: ItemWithResult[];
  doneCount?: number;
}
