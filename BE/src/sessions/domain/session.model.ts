import { SearchSources } from '../../research/domain/model/search-sources.model';

export interface Task {
  id: number;
  title: string;
  icon: string;
  prompt: string;
}

export interface Session {
  id: string;
  topic: string;
  model: string;
  createdAt: string;
  tasks: Task[];
  results: Record<string, string>;
  statuses: Record<string, string>;
  sources: Record<string, SearchSources>;
  summary?: string;
}
