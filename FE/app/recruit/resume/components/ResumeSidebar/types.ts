import type { CompanyNewsItem } from "@/lib/api/recruit/company-news";

export type SidebarTab =
  | "company"
  | "jd"
  | "eval"
  | "search"
  | "covers"
  | "news";

export type EvalItemType =
  | "evaluate"
  | "jd_evaluate"
  | "spellcheck"
  | "example";

export interface EvalItem {
  subjectKey: string;
  type: EvalItemType;
  title: string;
  result: string;
  loading: boolean;
  error: string | null;
  model: string;
  runToken?: number;
}

export interface NewsItemState extends CompanyNewsItem {
  detailResult?: string;
  detailLoading?: boolean;
  detailError?: string | null;
}
