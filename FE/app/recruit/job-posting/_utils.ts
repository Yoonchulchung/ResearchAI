import type { JobPosting } from "@/lib/api/recruit/job-posting";

export const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
};

export const parsePostingDate = (raw?: string) => {
  if (!raw) return null;
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  const fullDateMatch = raw.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (fullDateMatch) return new Date(Number(fullDateMatch[1]), Number(fullDateMatch[2]) - 1, Number(fullDateMatch[3]));
  const monthDayMatch = raw.match(/(\d{1,2})[./](\d{1,2})/);
  if (monthDayMatch) {
    const today = new Date();
    return new Date(today.getFullYear(), Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]));
  }
  return null;
};

export const getDeadlineDate = (posting: JobPosting) => parsePostingDate(posting.endDate || posting.deadline);
export const getStartDate = (posting: JobPosting) => parsePostingDate(posting.startDate);

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const getCalendarDays = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export const getDdayLabel = (posting: JobPosting) => {
  if (/상시|채용 시|수시/.test(posting.deadline ?? "")) return null;
  const deadline = getDeadlineDate(posting);
  if (!deadline || Number.isNaN(deadline.getTime())) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const deadlineStart = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
  const diffDays = Math.ceil((deadlineStart - todayStart) / 86_400_000);
  if (diffDays < 0) return "마감";
  if (diffDays === 0) return "D-Day";
  return `D-${diffDays}`;
};

export const normalizeType = (t: string) => {
  if (/^NEW$/i.test(t)) return "신입";
  if (/^EXPERIENCED$/i.test(t)) return "경력";
  if (/^CONTRACT$/i.test(t)) return "계약직";
  if (/인턴|intern/i.test(t)) return "인턴";
  if (/신입/.test(t) && /경력/.test(t)) return "신입·경력";
  if (/신입/.test(t)) return "신입";
  if (/경력/.test(t)) return "경력";
  if (/계약/.test(t)) return "계약직";
  return t;
};

const IT_KEYWORDS = ["it", "인터넷", "정보기술", "웹", "서버", "네트워크", "보안", "데이터", "ai", "인공지능", "개발", "소프트웨어", "sw", "클라우드", "플랫폼", "백엔드", "프론트엔드", "풀스택", "모바일", "앱", "ios", "android", "qa", "si개발", "erp", "솔루션"];
const ELEC_STRONG_KEYWORDS = ["전자", "반도체", "디스플레이", "회로", "하드웨어", "임베디드", "펌웨어"];
const ELEC_CONTEXT_KEYWORDS = ["전기", "제어", "통신"];
const NON_ELEC_JOB_KEYWORDS = ["객실서비스", "벨데스크", "하우스키핑", "고객서비스", "고객관리", "식음", "조리", "요리", "플로리스트", "경영지원", "인사", "상담", "웨딩", "매장관리", "판매"];

export const matchesPopularCategory = (p: JobPosting, cat: "" | "IT" | "전자"): boolean => {
  if (!cat) return true;
  if (cat === "IT") {
    const haystack = [p.category, p.jobs, p.title].filter(Boolean).join(" ").toLowerCase();
    return IT_KEYWORDS.some((k) => haystack.includes(k));
  }
  const primaryText = [p.jobs, p.title].filter(Boolean).join(" ").toLowerCase();
  const categoryText = (p.category ?? "").toLowerCase();
  const fullText = `${primaryText} ${categoryText}`;
  if (ELEC_STRONG_KEYWORDS.some((k) => fullText.includes(k))) return true;
  if (ELEC_CONTEXT_KEYWORDS.some((k) => primaryText.includes(k))) return true;
  const hasContextCategory = ELEC_CONTEXT_KEYWORDS.some((k) => categoryText.includes(k));
  if (!hasContextCategory) return false;
  const isBroadFacilityCategory = /전기\/소방\/통신\/안전|소방|안전/.test(categoryText);
  const looksLikeNonElectronicsJob = NON_ELEC_JOB_KEYWORDS.some((k) => primaryText.includes(k));
  if (isBroadFacilityCategory || looksLikeNonElectronicsJob) return false;
  return true;
};
