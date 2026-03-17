export enum SearchMode {
  WEB = 'web',
  RECRUIT = 'recruit',
  BOTH = 'both',
}

export enum PlannerMode {
  AUTO = 'auto',
}

export enum SearchEngine {
  TAVILY      = 'tavily',
  SERPER      = 'serper',
  NAVER       = 'naver',
  BRAVE       = 'brave',
  DUCKDUCKGO  = 'duckduckgo',
  ANTHROPIC_BUILTIN = 'anthropic-builtin',
  GOOGLE_BUILTIN    = 'google-builtin',
}

export function isBuiltinSearchEngine(engine: SearchEngine | string): boolean {
  return engine === SearchEngine.ANTHROPIC_BUILTIN || engine === SearchEngine.GOOGLE_BUILTIN;
}

export interface SearchPlan {
  searchMode: SearchMode;
  reason: string;
  keyword: string;
  keywordCandidates?: string[];
  companyTypes?: string[];
  jobTypes?: string[];
  model?: string;
}