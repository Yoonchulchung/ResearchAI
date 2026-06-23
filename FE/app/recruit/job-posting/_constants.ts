import type { JobPostingFilterOptions } from "@/lib/api/recruit/job-posting";
import type { PersistedFilters } from "./_types";

export const PAGE_SIZE = 30;

export const SOURCE_LABELS: Record<string, string> = {
  "": "전체",
  favorite: "즐겨찾기",
  linkareer: "링커리어",
  jobkorea: "잡코리아",
  catch: "캐치",
  jobplanet: "잡플래닛",
  jobda: "잡다",
};

export const DEFAULT_FILTER_OPTIONS: JobPostingFilterOptions = {
  jobs: [],
  companyTypes: [],
  types: ["인턴", "신입", "경력", "신입·경력", "계약직"],
  categories: ["IT", "기획", "전자"],
};

export const FILTER_STORAGE_KEY = "job-posting.filters.v1";
export const SOURCE_KEYS = new Set(Object.keys(SOURCE_LABELS));

export const DEFAULT_PERSISTED_FILTERS: PersistedFilters = {
  search: "",
  sourceFilter: "",
  companyTypeFilter: "",
  typeFilter: "",
  categoryFilter: "",
  sortOrder: "latest",
};

export const readPersistedFilters = (): PersistedFilters => {
  if (typeof window === "undefined") return DEFAULT_PERSISTED_FILTERS;
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_PERSISTED_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    return {
      search: parsed.search ?? "",
      sourceFilter: SOURCE_KEYS.has(parsed.sourceFilter ?? "") ? (parsed.sourceFilter ?? "") : "",
      companyTypeFilter: parsed.companyTypeFilter ?? "",
      typeFilter: parsed.typeFilter ?? "",
      categoryFilter: parsed.categoryFilter ?? "",
      sortOrder: parsed.sortOrder === "deadline" ? "deadline" : "latest",
    };
  } catch {
    return DEFAULT_PERSISTED_FILTERS;
  }
};

export const persistFilters = (filters: PersistedFilters) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
};
