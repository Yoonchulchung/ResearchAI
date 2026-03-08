export enum DeepResearchAction {
  START = 'start',
  STOP = 'stop',
}

export class DeepResearchTaskDto {
  itemId: string;
  prompt: string;
}

export class DeepResearchStreamDto {
  sessionId: string;
  items: DeepResearchTaskDto[];
  localAIModel: string;
  cloudAIModel: string;
  status: DeepResearchAction;
}
