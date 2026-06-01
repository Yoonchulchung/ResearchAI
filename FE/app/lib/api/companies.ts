import { apiFetch } from "./base";

export interface CompanyListItem {
  id: string;
  normalizedName: string;
  name: string;
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  address: string | null;
  homeUrl: string | null;
  ceoName: string | null;
  corpCode: string | null;
  stockCode: string | null;
  revenue: string | null;
  industry: string | null;
  source: string | null;
  sources: string[];
  hasAnalysis: boolean;
  analysisCompanyKey: string | null;
  analysisUpdatedAt: string | null;
  analysisSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySlimItem {
  id: string;
  name: string;
  companyType: string | null;
}

export async function listCompanies(params?: {
  q?: string;
  hasAnalysis?: boolean;
  limit?: number;
}): Promise<CompanyListItem[]> {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (typeof params?.hasAnalysis === "boolean") qs.set("hasAnalysis", String(params.hasAnalysis));
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<CompanyListItem[]>(`/companies${suffix}`);
}

export async function listCompaniesSlim(params?: {
  hasAnalysis?: boolean;
  limit?: number;
}): Promise<CompanySlimItem[]> {
  const qs = new URLSearchParams({ slim: "true" });
  if (typeof params?.hasAnalysis === "boolean") qs.set("hasAnalysis", String(params.hasAnalysis));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<CompanySlimItem[]>(`/companies?${qs.toString()}`);
}

export async function getCompany(id: string): Promise<CompanyListItem | null> {
  return apiFetch<CompanyListItem | null>(`/companies/${encodeURIComponent(id)}`);
}

export async function refreshCompanyMissing(id: string): Promise<CompanyListItem> {
  return apiFetch<CompanyListItem>(`/companies/${encodeURIComponent(id)}/refresh-missing`, {
    method: "POST",
  });
}

export interface CompanyMissingStats {
  total: number;
  missingCompanyType: number;
  missingEmployees: number;
}

export async function getMissingStats(): Promise<CompanyMissingStats> {
  return apiFetch<CompanyMissingStats>("/companies/missing-stats");
}

export async function refreshAllMissingCompanies(): Promise<{ total: number }> {
  return apiFetch<{ total: number }>("/companies/refresh-all-missing", { method: "POST" });
}

export async function stopMissingRefresh(): Promise<void> {
  await apiFetch<{ ok: boolean }>("/companies/refresh-all-missing/stop", { method: "POST" });
}

export interface CompanyMissingRefreshStatus {
  phase: "idle" | "running" | "done" | "stopped";
  total: number;
  processed: number;
}

export async function getMissingRefreshStatus(): Promise<CompanyMissingRefreshStatus> {
  return apiFetch<CompanyMissingRefreshStatus>("/companies/refresh-all-missing/status");
}

export async function getCompanyCollectEnabled(): Promise<boolean> {
  const res = await apiFetch<{ enabled: boolean }>("/companies/settings/collect-enabled");
  return res.enabled;
}

export async function setCompanyCollectEnabled(enabled: boolean): Promise<void> {
  await apiFetch<{ enabled: boolean }>("/companies/settings/collect-enabled", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}
