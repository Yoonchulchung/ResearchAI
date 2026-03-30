export enum DeepResearchAction {
  START = 'start',
  STOP = 'stop',
}

export class EnqueueDeepResearchItemDto {
  itemId: string;
  content: string;
}

export class EnqueueDeepResearchDto {
  items: EnqueueDeepResearchItemDto[];
  aiModel?: string;
  webModel?: string;
  filterModel?: string;
  status: DeepResearchAction;
}
