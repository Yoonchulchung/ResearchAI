export enum AIProvider {
  ANTHROPIC = 'Anthropic',
  GOOGLE = 'Google',
  OPENAI = 'OpenAI',
  OLLAMA = 'Ollama',
  LLAMA_CPP = 'LlamaCpp',
}

export const GEMINI_ROLE = {
  USER:  'user',
  MODEL: 'model',
} as const;

export const AI_MODEL_PREFIX = {
  ANTHROPIC: 'claude',
  GOOGLE: 'gemini',
  OLLAMA: 'ollama:',
  LLAMA_CPP: 'llama:',
} as const;

export function getProvider(model: string): AIProvider {
  if (model.startsWith(AI_MODEL_PREFIX.ANTHROPIC)) return AIProvider.ANTHROPIC;
  if (model.startsWith(AI_MODEL_PREFIX.GOOGLE)) return AIProvider.GOOGLE;
  if (model.startsWith(AI_MODEL_PREFIX.OLLAMA)) return AIProvider.OLLAMA;
  if (model.startsWith(AI_MODEL_PREFIX.LLAMA_CPP)) return AIProvider.LLAMA_CPP;
  return AIProvider.OPENAI;
}

export const GROQ_FREE_MAX_INPUT_CHARS = 20_000; // Groq 무료 TPM 12,000 기준 (한국어 ~2 chars/token, 출력 2,000 토큰 예약)

export const MODELS = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    description: '최고 성능 · 복잡한 분석에 최적',
    inputPricePer1M: 15,
    outputPricePer1M: 75,
    contextWindow: 200000,
    webSearch: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: '균형잡힌 성능 · 리서치에 권장',
    inputPricePer1M: 3,
    outputPricePer1M: 15,
    contextWindow: 200000,
    webSearch: true,
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: '빠른 응답 · 비용 효율적',
    inputPricePer1M: 0.8,
    outputPricePer1M: 4,
    contextWindow: 200000,
    webSearch: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: '강력한 멀티모달 · OpenAI 최신',
    inputPricePer1M: 2.5,
    outputPricePer1M: 10,
    contextWindow: 128000,
    webSearch: false,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'openai',
    description: '빠르고 저렴 · 간단한 작업에 적합',
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    contextWindow: 128000,
    webSearch: false,
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    provider: 'openai',
    description: '고급 추론 · 논리적 분석 특화',
    inputPricePer1M: 1.1,
    outputPricePer1M: 4.4,
    contextWindow: 200000,
    webSearch: false,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    description: '고속 처리 · Google 검색 연동',
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    contextWindow: 1000000,
    webSearch: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    description: '최강 추론 · 대용량 컨텍스트',
    inputPricePer1M: 1.25,
    outputPricePer1M: 10,
    contextWindow: 1000000,
    webSearch: true,
  },
  // Groq 무료 폴백 모델
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq Free)',
    provider: 'groq',
    description: 'Groq 무료 티어 · Gemini 할당량 초과 시 자동 폴백',
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    contextWindow: 128000,
    webSearch: false,
    free: true,
  },
];
