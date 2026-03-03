export interface Task {
  id: number;
  title: string;
  icon: string;
  prompt: string;
}

export type TaskStatus = "idle" | "loading" | "done" | "error";

export type Provider = "anthropic" | "openai" | "google";

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

export interface Session {
  id: string;
  topic: string;
  model: string;
  createdAt: string;
  tasks: Task[];
  results: Record<string, string>;
  statuses: Record<string, TaskStatus>;
  doneCount?: number;
}
