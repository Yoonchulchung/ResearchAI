import { apiFetch } from "./base";

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

export const CATEGORY_LABELS: Record<string, string> = {
  llm: "LLM",
  vlm: "Vision-Language",
  asr: "Speech (ASR)",
  code: "Code",
  "text-to-image": "Text-to-Image",
};

export const CATEGORY_SCORE_LABEL: Record<string, string> = {
  llm: "평균 점수",
  vlm: "평균 점수",
  asr: "정확도 (100-WER)",
  code: "Pass@1",
  "text-to-image": "HF 좋아요 (K)",
};

export const CATEGORY_BENCHMARK_DEFS: Record<string, Record<string, string>> = {
  llm:            { ifeval: "IFEval", bbh: "BBH", mathLvl5: "MATH Lvl 5", gpqa: "GPQA", musr: "MUSR", mmluPro: "MMLU-PRO" },
  vlm:            { mmbench: "MMBench", mmstar: "MMStar", mmmu: "MMMU", mathvista: "MathVista", ai2d: "AI2D", hallusionbench: "HallusionBench", ocrbench: "OCRBench" },
  asr:            { libriSpeechClean: "LibriSpeech (clean)", libriSpeechOther: "LibriSpeech (other)", commonVoice: "Common Voice", voxpopuli: "VoxPopuli", earnings22: "Earnings22" },
  code:           { humanEval: "HumanEval", mbpp: "MBPP", humanEvalPlus: "HumanEval+", mbppPlus: "MBPP+", ds1000: "DS-1000" },
  "text-to-image": { hfLikes: "HF 좋아요", hfDownloads: "HF 다운로드 (K)" },
};

// Benchmark descriptions shown on the detail page per category
export const CATEGORY_BENCHMARK_DESC: Record<string, Array<{ key: string; name: string; desc: string }>> = {
  llm: [
    { key: "ifeval", name: "IFEval", desc: "명령어 준수 능력 (Instruction Following)" },
    { key: "bbh", name: "BBH", desc: "복잡한 추론 (Big-Bench Hard)" },
    { key: "mathLvl5", name: "MATH Lvl 5", desc: "고난도 수학 문제" },
    { key: "gpqa", name: "GPQA", desc: "전문가 수준 과학 Q&A" },
    { key: "musr", name: "MUSR", desc: "멀티스텝 소프트 추론" },
    { key: "mmluPro", name: "MMLU-PRO", desc: "전문 지식 다지선다 (강화판)" },
  ],
  vlm: [
    { key: "mmbench", name: "MMBench", desc: "멀티모달 이해 종합 벤치마크" },
    { key: "mmstar", name: "MMStar", desc: "시각-언어 능력 평가 (편향 제거)" },
    { key: "mmmu", name: "MMMU", desc: "대학 수준 멀티모달 이해" },
    { key: "mathvista", name: "MathVista", desc: "시각적 수학 문제 풀이" },
    { key: "ai2d", name: "AI2D", desc: "다이어그램 이해 및 질의응답" },
    { key: "hallusionbench", name: "HallusionBench", desc: "환각(Hallucination) 저항성 평가" },
    { key: "ocrbench", name: "OCRBench", desc: "광학 문자 인식 능력" },
  ],
  asr: [
    { key: "libriSpeechClean", name: "LibriSpeech (clean)", desc: "깨끗한 영어 음성 인식 (100 - WER)" },
    { key: "libriSpeechOther", name: "LibriSpeech (other)", desc: "다양한 환경 영어 음성 인식 (100 - WER)" },
    { key: "commonVoice", name: "Common Voice", desc: "다국어 음성 인식 (100 - WER)" },
    { key: "voxpopuli", name: "VoxPopuli", desc: "유럽의회 다국어 음성 (100 - WER)" },
    { key: "earnings22", name: "Earnings22", desc: "실제 비즈니스 대화 음성 (100 - WER)" },
  ],
  code: [
    { key: "humanEval", name: "HumanEval", desc: "Python 함수 완성 (Pass@1)" },
    { key: "mbpp", name: "MBPP", desc: "기본 Python 프로그래밍 (Pass@1)" },
    { key: "humanEvalPlus", name: "HumanEval+", desc: "HumanEval 강화판 (더 많은 테스트케이스)" },
    { key: "mbppPlus", name: "MBPP+", desc: "MBPP 강화판" },
    { key: "ds1000", name: "DS-1000", desc: "데이터 사이언스 코드 생성" },
  ],
  "text-to-image": [
    { key: "hfLikes", name: "HF 좋아요", desc: "HuggingFace 좋아요 수 (인기도 지표)" },
    { key: "hfDownloads", name: "HF 다운로드 (K)", desc: "HuggingFace 다운로드 수 (천 단위)" },
  ],
};

export const CATEGORY_TABLE_BENCHMARKS: Record<string, string[]> = {
  llm:            ["ifeval", "bbh", "mathLvl5", "gpqa"],
  vlm:            ["mmbench", "mmstar", "mmmu", "mathvista"],
  asr:            ["libriSpeechClean", "libriSpeechOther", "commonVoice"],
  code:           ["humanEval", "mbpp", "humanEvalPlus"],
  "text-to-image": ["hfLikes", "hfDownloads"],
};

export interface DataSource {
  name: string;
  url: string;
  note?: string;
}

export const CATEGORY_DATA_SOURCES: Record<string, DataSource[]> = {
  llm: [
    { name: "HF Open LLM Leaderboard v2", url: "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard", note: "IFEval·BBH·MATH·GPQA·MUSR·MMLU-PRO 6개 벤치마크 평균" },
    { name: "Artificial Analysis", url: "https://artificialanalysis.ai/leaderboards/models", note: "Free API의 Intelligence Index와 GPQA·MMLU-PRO·속도·가격 보조 지표를 반영" },
    { name: "HuggingFace Models API", url: "https://huggingface.co/models?pipeline_tag=text-generation", note: "좋아요·다운로드 기반 보조 신호를 로그 정규화해 평균에 반영" },
  ],
  vlm: [
    { name: "OpenVLM Leaderboard", url: "https://huggingface.co/spaces/opencompass/open_vlm_leaderboard", note: "OpenCompass 운영, 미지원 시 HF 좋아요 기준" },
    { name: "HuggingFace Models API", url: "https://huggingface.co/models?pipeline_tag=image-text-to-text", note: "좋아요·다운로드 기반 보조 신호" },
  ],
  asr: [
    { name: "Open ASR Leaderboard", url: "https://huggingface.co/spaces/hf-audio/open_asr_leaderboard", note: "WER → 100-WER 정확도로 변환, 미지원 시 HF 좋아요 기준" },
    { name: "HuggingFace Models API", url: "https://huggingface.co/models?pipeline_tag=automatic-speech-recognition", note: "좋아요·다운로드 기반 보조 신호" },
  ],
  code: [
    { name: "BigCode Models Leaderboard", url: "https://huggingface.co/spaces/bigcode/bigcode-models-leaderboard", note: "HumanEval·MBPP Pass@1, 미지원 시 HF 좋아요 기준" },
    { name: "EvalPlus Leaderboard", url: "https://huggingface.co/spaces/evalplus/leaderboard", note: "HumanEval+·MBPP+ 계열 보조 벤치마크" },
    { name: "HuggingFace Models API", url: "https://huggingface.co/models?pipeline_tag=text-generation&filter=code", note: "코드 모델 좋아요·다운로드 기반 보조 신호" },
  ],
  "text-to-image": [
    { name: "HuggingFace Models API", url: "https://huggingface.co/models?pipeline_tag=text-to-image", note: "좋아요와 다운로드를 각각 정규화해 평균" },
  ],
};

export const MODEL_TYPE_LABELS: Record<string, string> = {
  pretrained: "Pretrained",
  chat: "Chat",
  "fine-tuned": "Fine-tuned",
  merge: "Merge",
  "open-source": "Open Source",
  api: "API",
  other: "Other",
};

// Legacy (LLM-specific) benchmark labels for the detail page
export const BENCHMARK_LABELS: Record<keyof Pick<AiModelEntry, "ifeval" | "bbh" | "mathLvl5" | "gpqa" | "musr" | "mmluPro">, string> = {
  ifeval: "IFEval",
  bbh: "BBH",
  mathLvl5: "MATH Lvl 5",
  gpqa: "GPQA",
  musr: "MUSR",
  mmluPro: "MMLU-PRO",
};

export const getTopModels = (n = 5, category = "llm") =>
  apiFetch<AiModelEntry[]>(`/ai-leaderboard/top?n=${n}&category=${encodeURIComponent(category)}`);

export const getLeaderboard = (params?: {
  limit?: number;
  offset?: number;
  category?: string;
  type?: string;
  maxParams?: number;
  minParams?: number;
  refresh?: boolean;
}) => {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  if (params?.category) q.set("category", params.category);
  if (params?.type) q.set("type", params.type);
  if (params?.maxParams != null) q.set("maxParams", String(params.maxParams));
  if (params?.minParams != null) q.set("minParams", String(params.minParams));
  if (params?.refresh) q.set("refresh", "true");
  const qs = q.toString();
  return apiFetch<LeaderboardResult>(`/ai-leaderboard${qs ? `?${qs}` : ""}`);
};

export const getModelById = (id: string) =>
  apiFetch<AiModelEntry>(`/ai-leaderboard/${encodeURIComponent(id)}`);
