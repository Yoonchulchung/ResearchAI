import type { CompetencyScores } from "@/lib/api/company-analysis";

export const COMPETENCY_LABELS: Array<{ key: keyof CompetencyScores; label: string }> = [
  { key: "성취지향", label: "성취지향" },
  { key: "도전정신", label: "도전정신" },
  { key: "주도성", label: "주도성" },
  { key: "문제해결", label: "문제해결" },
  { key: "의사소통", label: "의사소통" },
  { key: "대인관계", label: "대인관계" },
  { key: "열정", label: "열정" },
  { key: "주인의식", label: "주인의식" },
  { key: "팀워크", label: "팀워크" },
  { key: "자원계획관리", label: "자원 계획·관리" },
  { key: "치밀성", label: "치밀성" },
  { key: "분석적사고", label: "분석적 사고" },
  { key: "전문성", label: "전문성" },
];

export const CORP_CLASS_LABEL: Record<string, string> = {
  Y: "유가증권(KOSPI)",
  K: "코스닥(KOSDAQ)",
  N: "코넥스",
  E: "비상장",
};

export const ANALYSIS_DETAIL_STEPS: Array<{ label: string; threshold: number }> = [
  { label: "요청", threshold: 2 },
  { label: "채용·인재상", threshold: 8 },
  { label: "뉴스", threshold: 15 },
  { label: "사업부문", threshold: 22 },
  { label: "직무", threshold: 30 },
  { label: "채용공고", threshold: 36 },
  { label: "경쟁사", threshold: 40 },
  { label: "기술·HRD", threshold: 43 },
  { label: "DART", threshold: 48 },
  { label: "리뷰·시세", threshold: 68 },
  { label: "AI 분석", threshold: 82 },
  { label: "저장", threshold: 96 },
  { label: "완료", threshold: 100 },
];
