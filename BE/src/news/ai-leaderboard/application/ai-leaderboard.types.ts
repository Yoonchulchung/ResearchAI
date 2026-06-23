export interface AiModelEntry {
  id: string;
  fullname: string;
  org: string;
  modelName: string;
  rank: number;
  category: string;
  average: number | null;
  ifeval: number | null;
  bbh: number | null;
  mathLvl5: number | null;
  gpqa: number | null;
  musr: number | null;
  mmluPro: number | null;
  params: number | null;
  architecture: string | null;
  modelType: string | null;
  license: string | null;
  likes: number | null;
  fetchedAt: string | null;
  benchmarks: Record<string, number | null>;
  sourceScores: Record<string, number | null>;
  sourceCount: number;
}

export interface LeaderboardResult {
  entries: AiModelEntry[];
  total: number;
  fetchedAt: string | null;
  category: string;
}

export interface LeaderboardQuery {
  limit?: number;
  offset?: number;
  category?: string;
  type?: string;
  maxParams?: number;
  minParams?: number;
  refresh?: boolean;
  sortBy?: string;
  sortDir?: LeaderboardSortDir;
}

export type LeaderboardSortDir = 'asc' | 'desc';

export interface NormalizedLeaderboardEntry {
  id: string;
  fullname: string;
  org: string;
  modelName: string;
  average: number | null;
  params: number | null;
  modelType: string | null;
  license: string | null;
  likes: number | null;
  architecture: string | null;
  benchmarks: Record<string, number | null>;
  sourceScores?: Record<string, number | null>;
}

export const CATEGORY_LABELS: Record<string, string> = {
  llm: 'LLM',
  vlm: 'Vision-Language',
  asr: 'Speech (ASR)',
  tts: 'Speech (TTS)',
  code: 'Code',
  'text-to-image': 'Text-to-Image',
  'image-editing': 'Image Editing',
  'text-to-video': 'Text-to-Video',
  'image-to-video': 'Image-to-Video',
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

export const CATEGORY_SCORE_LABEL: Record<string, string> = {
  llm: '평균 점수',
  vlm: '평균 점수',
  asr: '정확도 (100-WER)',
  tts: '품질 점수',
  code: 'Pass@1',
  'text-to-image': '품질 점수',
  'image-editing': '품질 점수',
  'text-to-video': '품질 점수',
  'image-to-video': '품질 점수',
};

export const CATEGORY_BENCHMARK_DEFS: Record<string, Record<string, string>> = {
  llm: {
    ifeval: 'IFEval',
    bbh: 'BBH',
    mathLvl5: 'MATH Lvl 5',
    gpqa: 'GPQA',
    musr: 'MUSR',
    mmluPro: 'MMLU-PRO',
  },
  vlm: {
    mmbench: 'MMBench',
    mmstar: 'MMStar',
    mmmu: 'MMMU',
    mathvista: 'MathVista',
    ai2d: 'AI2D',
    hallusionbench: 'HallusionBench',
    ocrbench: 'OCRBench',
  },
  asr: {
    libriSpeechClean: 'LibriSpeech (clean)',
    libriSpeechOther: 'LibriSpeech (other)',
    commonVoice: 'Common Voice',
    voxpopuli: 'VoxPopuli',
    earnings22: 'Earnings22',
  },
  tts: {
    elo: 'AA Elo',
    appearances: 'Samples',
    categoryBestElo: 'Best Category Elo',
    categoryCount: 'Categories',
  },
  code: {
    humanEval: 'HumanEval',
    mbpp: 'MBPP',
    humanEvalPlus: 'HumanEval+',
    mbppPlus: 'MBPP+',
    ds1000: 'DS-1000',
  },
  'text-to-image': {
    elo: 'AA Elo',
    appearances: 'Samples',
    categoryBestElo: 'Best Category Elo',
    categoryCount: 'Categories',
  },
  'image-editing': {
    elo: 'AA Elo',
    appearances: 'Samples',
    aaRank: 'AA Rank',
    hfLikes: 'HF 좋아요',
  },
  'text-to-video': {
    elo: 'AA Elo',
    appearances: 'Samples',
    categoryBestElo: 'Best Category Elo',
    categoryCount: 'Categories',
  },
  'image-to-video': {
    elo: 'AA Elo',
    appearances: 'Samples',
    categoryBestElo: 'Best Category Elo',
    categoryCount: 'Categories',
  },
};
