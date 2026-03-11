export enum SearchMode {
  WEB = 'web',
  RECRUIT = 'recruit',
  BOTH = 'both',
}

export enum PlannerMode {
  AUTO = 'auto',
}

export enum SearchEngine {
  TAVILY = 'tavily',
  SERPER = 'serper',
  NAVER  = 'naver',
  BRAVE  = 'brave',
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