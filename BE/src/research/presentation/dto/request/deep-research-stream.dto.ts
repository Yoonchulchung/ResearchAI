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
  model: string;
  status: DeepResearchAction;
}
