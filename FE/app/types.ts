export interface Task {
  id: number;
  title: string;
  icon: string;
  prompt: string;
}

export interface SearchSources {
  tavily?: string;
  serper?: string;
  naver?: string;
  brave?: string;
  ollama?: string;
}

export type TaskStatus = "idle" | "queued" | "loading" | "done" | "error";

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

export interface Session {
  id: string;
  topic: string;
  model: string;
  createdAt: string;
  tasks: Task[];
  results: Record<string, string>;
  statuses: Record<string, TaskStatus>;
  sources?: Record<string, SearchSources>;
  doneCount?: number;
}
