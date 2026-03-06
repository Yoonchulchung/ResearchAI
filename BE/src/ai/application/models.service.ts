import { Injectable } from '@nestjs/common';
import { MODELS } from '../domain/models';

@Injectable()
export class ModelsService {
  async getModels() {
    const models: (typeof MODELS[number] & { provider: string })[] = [...MODELS];
    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const res = await fetch(`${ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = (await res.json()) as { models: { name: string }[] };
        for (const m of data.models) {
          models.push({
            id: `ollama:${m.name}`,
            name: m.name,
            provider: 'ollama',
            description: '로컬 Ollama 모델',
            inputPricePer1M: 0,
            outputPricePer1M: 0,
            contextWindow: 8192,
            webSearch: false,
          });
        }
      }
    } catch {
      // Ollama 실행 중이 아닌 경우 무시
    }
    return models;
  }
}
