export interface Task {
  id: number;
  title: string;
  webSearchPrompt: string;
}

export interface ItemWithResult extends Task {
  itemId: string;
  status: string;
  researchState?: string;
  webResult: string | null;
  webModel: string;
  usedWebModel: string | null;
  searchLog: { query: string; result: string }[] | null;
  result: string | null;
  confidenceScore: number | null;
  confidenceReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedFees: number | null;
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
