import { apiFetch } from "@/lib/api/base";

export type LandSourceStatus = "live" | "unavailable" | "unsupported";

export interface LandSourceInfo {
  provider: "naver-land";
  status: LandSourceStatus;
  message: string;
}

export interface LandComplex {
  complexNo: string;
  complexName: string;
  dealPrice: number | null;
  leasePrice: number | null;
  minDealPrice: number | null;
  maxDealPrice: number | null;
  minLeasePrice: number | null;
  maxLeasePrice: number | null;
  householdCount: number | null;
  buildYear: number | null;
  latitude: number | null;
  longitude: number | null;
  naverUrl: string;
}

export interface LandSummary {
  avgDealPrice: number | null;
  avgLeasePrice: number | null;
  minDealPrice: number | null;
  maxDealPrice: number | null;
  minLeasePrice: number | null;
  maxLeasePrice: number | null;
  complexCount: number;
}

export interface LandOverview {
  query: string;
  district: string;
  cortarNo: string | null;
  generatedAt: string;
  naverLandUrl: string;
  source: LandSourceInfo;
  summary: LandSummary;
  complexes: LandComplex[];
}

export function getLandOverview(query: string, limit = 30): Promise<LandOverview> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  return apiFetch<LandOverview>(`/land/overview?${params.toString()}`);
}
