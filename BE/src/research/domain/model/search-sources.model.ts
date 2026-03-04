export interface SearchSources {
  tavily?: string;
  serper?: string;
  naver?: string;
  brave?: string;
  ollama?: string;
}

export type SearchStreamEvent =
  | { type: 'source'; key: keyof SearchSources; result: string }
  | { type: 'done'; sources: SearchSources; context: string };
