export interface ResumeSelfIntro {
  id?: string;
  question?: string;
  title?: string; // legacy alias
  answer?: string;
  category?: string[] | string | null;
  refinedTitle?: string | null;
  companyName?: string; // legacy
  jobTitle?: string; // legacy
  jd?: string; // legacy
}

export interface ResumeExperienceDto {
  id: string;
  activityType: string;
  organizationName: string;
  startDate: string | null;
  endDate: string | null;
  role: string | null;
  description: string | null;
}

export interface ResumePrizeDto {
  id: string;
  title: string;
  organization: string;
  issuedDate: string | null;
  description: string | null;
}

export interface ResumeTrainingDto {
  id: string;
  title: string;
  institution: string;
  startDate: string | null;
  endDate: string | null;
  hours: string | null;
  description: string | null;
}

export interface ResumeTarget {
  id?: string;
  companyName?: string;
  companyId?: string | null;
  jobTitle?: string;
  appliedAt?: string;
  applyDate?: string; // legacy alias accepted on write
  updatedAt?: string;
  isDeleted?: boolean;
  jd?: string;
  interviewScript?: string | null;
  selfIntroductions?: ResumeSelfIntro[];
  coverLetters?: ResumeSelfIntro[]; // legacy alias
  experiences?: ResumeExperienceDto[];
  prizes?: ResumePrizeDto[];
  trainings?: ResumeTrainingDto[];
}

// Accept any shape for saveResume (legacy compat)
export type AnyProfile = {
  resume?: ResumeTarget[];
  resumeTargets?: ResumeTarget[];
  selfIntroductions?: ResumeSelfIntro[];
  replaceAll?: boolean;
  [key: string]: unknown;
};

export type ResumeResult = { resume: ResumeTarget[] };
export type ResumePdfResult = { buffer: Buffer; filename: string };

export interface ResumeVersionSummary {
  id: string;
  resumeId: string;
  title: string | null;
  companyName: string;
  jobTitle: string;
  appliedAt: string;
  createdAt: string;
}

export type ResumeVersionListResult = { items: ResumeVersionSummary[] };
export type ResumeVersionDetailResult = {
  version: ResumeVersionSummary;
  target: ResumeTarget;
};

interface ResumeSearchCoverLetterItem {
  type: 'coverLetter';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  question: string;
  answer: string;
  categories: string[];
  refinedTitle: string | null;
}

interface ResumeSearchExperienceItem {
  type: 'experience';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  activityType: string;
  organizationName: string;
  startDate: string | null;
  endDate: string | null;
  role: string | null;
  description: string | null;
}

interface ResumeSearchPrizeItem {
  type: 'prize';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  title: string;
  organization: string;
  issuedDate: string | null;
  description: string | null;
}

interface ResumeSearchTrainingItem {
  type: 'training';
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  title: string;
  institution: string;
  startDate: string | null;
  endDate: string | null;
  hours: string | null;
  description: string | null;
}

export type ResumeSearchItem =
  | ResumeSearchCoverLetterItem
  | ResumeSearchExperienceItem
  | ResumeSearchPrizeItem
  | ResumeSearchTrainingItem;

export type ResumeSearchResult = { items: ResumeSearchItem[] };

export interface ResumeCoverLetterCategoryItem {
  id: string;
  resumeId: string;
  title: string;
  answer: string;
  category: string[];
}
