export class DeepResearchTaskDto {
  itemId: string;
  prompt: string;
}

export class DeepResearchStreamDto {
  sessionId: string;
  tasks: DeepResearchTaskDto[];
  model: string;
}
