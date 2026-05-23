import type { JobPosting } from "@/lib/api/recruit/job-posting";

export interface PersistedFilters {
  search: string;
  sourceFilter: string;
  companyTypeFilter: string;
  typeFilter: string;
  categoryFilter: string;
  sortOrder: "latest" | "deadline";
}

export type CalendarEventKind = "start" | "end";

export interface CalendarEvent {
  key: string;
  kind: CalendarEventKind;
  posting: JobPosting;
}
