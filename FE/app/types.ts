export interface Task {
  id: number;
  itemId: string;
  title: string;
  icon: string;
  prompt: string;
  status?: string;
  researchState?: string;
  result?: string | null;
}

export interface SearchSources {
  tavily?: string;
  serper?: string;
  naver?: string;
  brave?: string;
  ollama?: string;
}

export enum TaskStatus {
  IDLE = "idle",
  PENDING = "pending",
  RUNNING = "running",
  DONE = "done",
  ERROR = "error",
  STOPPED = "stopped",
  ABORTED = "aborted",
}

export type Provider = "anthropic" | "openai" | "google" | "ollama";

export interface ModelDefinition {
  id: string;
  name: string;
  provider: Provider;
  description: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  contextWindow: number;
  webSearch: boolean;
}

export type QueueJobStatus = "pending" | "running" | "done" | "error";
export type QueueJobPhase = "searching" | "analyzing";

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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ResearchState = "idle" | "pending" | "running" | "done" | "error";

export interface Session {
  id: string;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  researchState?: ResearchState;
  createdAt: string;
  summary?: string | null;
  items?: Task[];
  doneCount?: number;
}
