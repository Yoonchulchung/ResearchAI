export const AI_MODELS = [
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "gpt-4o-mini", name: "GPT-4o mini" },
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
];

export const CATEGORY_COLOR: Record<string, { bg: string; text: string }> = {
  개발:   { bg: "bg-violet-600",  text: "text-white" },
  기획:   { bg: "bg-teal-500",    text: "text-white" },
  디자인: { bg: "bg-pink-500",    text: "text-white" },
  마케팅: { bg: "bg-orange-500",  text: "text-white" },
  영업:   { bg: "bg-amber-500",   text: "text-white" },
  운영:   { bg: "bg-cyan-600",    text: "text-white" },
  연구:   { bg: "bg-indigo-600",  text: "text-white" },
  교육:   { bg: "bg-emerald-600", text: "text-white" },
  기타:   { bg: "bg-slate-500",   text: "text-white" },
};

export const DEFAULT_CATEGORY_COLOR = { bg: "bg-slate-400", text: "text-white" };

export const CATEGORIES = ["개발", "기획", "디자인", "마케팅", "영업", "운영", "연구", "교육", "기타"];
