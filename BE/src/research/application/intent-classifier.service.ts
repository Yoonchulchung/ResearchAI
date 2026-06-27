import { Injectable } from '@nestjs/common';
import { IntentClassifierImplService } from 'src/research/application/intent-classifier/intent-classifier-impl.service';

export type Intent = 'chat' | 'research' | 'clarify';

export interface IntentInput {
  topic: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  localAIModel?: string;
}

export interface IntentResult {
  intent: Intent;
  message: string;
  refinedTopic?: string;
}

@Injectable()
export class IntentClassifierService {
  constructor(private readonly impl: IntentClassifierImplService) {}

  classify(input: IntentInput): Promise<IntentResult> {
    return this.impl.classify(input);
  }
}
