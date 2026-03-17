export enum DeepResearchAction {
  START = 'start',
  STOP = 'stop',
}

export class EnqueueDeepResearchItemDto {
  itemId: string;
  prompt: string;
}

export class EnqueueDeepResearchDto {
  items: EnqueueDeepResearchItemDto[];
  localAIModel: string;
  cloudAIModel: string;
  webModel?: string;
  status: DeepResearchAction;
}
