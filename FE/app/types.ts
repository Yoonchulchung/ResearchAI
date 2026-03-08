export interface Task {
  id: number;
  itemId: string;
  title: string;
  icon: string;
  webSearchPrompt: string;
  status?: string;
  researchState?: string;
  webResult?: string | null;
  webModel?: string;
  aiResult?: string | null;
}

export interface WebModels {
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
  summaryState?: string | null;
  createdAt: string;
  summary?: string | null;
  items?: Task[];
  doneCount?: number;
}
