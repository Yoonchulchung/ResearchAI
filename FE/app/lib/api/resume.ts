import { apiFetch } from "./base";

export interface ResumeBasicInfo {
  name: string;
  englishName: string;
  gender: string;
  birthDate: string;
  email: string;
  phone: string;
  address: string;
  nationality: string;
  hobby: string;
  motto: string;
}

export interface ResumeEducation {
  id: string;
  type: "high" | "university" | "graduate" | "other";
  school: string;
  location: string;
  startDate: string;
  endDate: string;
  status: string;
  major?: string;
  gpa?: string;
  gpaMax?: string;
  category?: string;
}

export interface ResumeLanguage {
  id: string;
  name: string;
  score: string;
  date?: string;
  regNo?: string;
}

export interface ResumeSkill {
  id: string;
  category: string;
  name: string;
  level?: string;
  period?: string;
}

export interface ResumeMilitary {
  status: string;
  rank?: string;
  dischargeType?: string;
  startDate?: string;
  endDate?: string;
}

export interface ResumeAward {
  id: string;
  title: string;
  organization: string;
  date: string;
  description?: string;
}

export interface ResumeActivity {
  id: string;
  type: string;
  organization: string;
  startDate: string;
  endDate?: string;
  role?: string;
  description?: string;
}

export interface ResumeOverseas {
  id: string;
  country: string;
  purpose: string;
  startDate: string;
  endDate: string;
  description?: string;
}

export interface ResumeSelfIntro {
  id: string;
  question: string;
  answer: string;
}

export interface ResumeProfile {
  basicInfo: ResumeBasicInfo;
  education: ResumeEducation[];
  languages: ResumeLanguage[];
  skills: ResumeSkill[];
  military?: ResumeMilitary;
  awards: ResumeAward[];
  activities: ResumeActivity[];
  overseas: ResumeOverseas[];
  selfIntroductions: ResumeSelfIntro[];
}

export function getResume(): Promise<ResumeProfile | null> {
  return apiFetch<ResumeProfile | null>("/resume");
}

export function saveResume(profile: ResumeProfile): Promise<ResumeProfile> {
  return apiFetch<ResumeProfile>("/resume", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}
