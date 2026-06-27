import { apiFetch, API_BASE, getAuthHeaders, readSSE } from "./base";
import type { YearlyFinancial } from "./company-analysis";

const readRequestCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<unknown>;
  }
>();

function cachedApiFetch<T>(
  key: string,
  path: string,
  ttlMs: number,
): Promise<T> {
  const cached = readRequestCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise as Promise<T>;
  }

  const promise = apiFetch<T>(path).catch((error) => {
    readRequestCache.delete(key);
    throw error;
  });
  readRequestCache.set(key, { expiresAt: Date.now() + ttlMs, promise });
  return promise;
}

function withAbortSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(
      new DOMException("요청이 중단되었습니다.", "AbortError"),
    );

  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("요청이 중단되었습니다.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

function clearCompanyReadCache(id: string) {
  const encodedId = encodeURIComponent(id);
  for (const key of readRequestCache.keys()) {
    if (key.includes(encodedId)) readRequestCache.delete(key);
  }
}

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

export interface CompanyStockQuote {
  symbol: string | null;
  stockCode: string | null;
  companyName: string;
  currency: string | null;
  exchangeName: string | null;
  regularMarketPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  marketMetrics: {
    per: number | null;
    pbr: number | null;
    eps: number | null;
    bps: number | null;
    estimatedPer: number | null;
    estimatedEps: number | null;
    dividendYield: number | null;
    dividend: number | null;
    asOf: string | null;
    source: string;
  } | null;
  chart: {
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number;
    volume: number | null;
  }[];
  interval: string;
  source: string;
  fetchedAt: string;
  error?: string;
}

export async function listCompanies(params?: {
  q?: string;
  hasAnalysis?: boolean;
  limit?: number;
  industry?: string;
}): Promise<CompanyListItem[]> {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (typeof params?.hasAnalysis === "boolean")
    qs.set("hasAnalysis", String(params.hasAnalysis));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.industry?.trim()) qs.set("industry", params.industry.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<CompanyListItem[]>(`/companies${suffix}`);
}

export async function listCompaniesSlim(params?: {
  hasAnalysis?: boolean;
  limit?: number;
}): Promise<CompanySlimItem[]> {
  const qs = new URLSearchParams({ slim: "true" });
  if (typeof params?.hasAnalysis === "boolean")
    qs.set("hasAnalysis", String(params.hasAnalysis));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<CompanySlimItem[]>(`/companies?${qs.toString()}`);
}

export async function getCompany(id: string): Promise<CompanyListItem | null> {
  return apiFetch<CompanyListItem | null>(
    `/companies/${encodeURIComponent(id)}`,
  );
}

export async function getCompanyStock(
  id: string,
  interval = "1d",
  before?: string,
): Promise<CompanyStockQuote> {
  const qs = new URLSearchParams({ interval });
  if (before) qs.set("before", before);
  qs.set("companyId", id);
  const path = `/financial/stock?${qs.toString()}`;
  if (before) return apiFetch<CompanyStockQuote>(path);
  return cachedApiFetch<CompanyStockQuote>(`stock:${path}`, path, 30_000);
}

/** symbol 기반 — DB에서 companyId 자동 매핑, 없으면 Yahoo fallback */
export async function getCompanyStockBySymbol(
  symbol: string,
  interval = "1d",
  before?: string,
): Promise<CompanyStockQuote> {
  const qs = new URLSearchParams({ symbol, interval });
  if (before) qs.set("before", before);
  const path = `/financial/stock?${qs.toString()}`;
  if (before) return apiFetch<CompanyStockQuote>(path);
  return cachedApiFetch<CompanyStockQuote>(`stock:${path}`, path, 30_000);
}

export interface CompanyPeerMetric {
  key: string;
  label: string;
  unit: string;
  companyValue: number | null;
  peerAverage: number | null;
  peerCount: number;
}

export interface CompanyRiskSignal {
  key: string;
  label: string;
  description: string;
  severity: "info" | "warning" | "danger";
  date: string | null;
}

export interface CompanyTimelineEvent {
  type: "news" | "disclosure" | "financial" | "risk";
  date: string;
  title: string;
  description?: string;
  url?: string;
  severity: "info" | "positive" | "warning" | "danger";
}

export interface CompanyFinancialInsights {
  industry: string | null;
  peerCount: number;
  peerCompanies?: string[];
  peerMetrics: CompanyPeerMetric[];
  riskSignals: CompanyRiskSignal[];
  timelineEvents: CompanyTimelineEvent[];
}

export interface CompanyFinancialAiAnalysis {
  overview: string;
  strengths: string[];
  concerns: string[];
  trends: {
    label: string;
    direction: "improving" | "worsening" | "mixed" | "stable";
    evidence: string;
  }[];
  checkpoints: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedFees: number;
  analyzedAt: string;
}

export async function getCompanyFinancialInsights(
  id: string,
): Promise<CompanyFinancialInsights> {
  const path = `/financial/insights?companyId=${encodeURIComponent(id)}`;
  return apiFetch<CompanyFinancialInsights>(path);
}

export async function getCompanyFinancialAiHistory(
  id: string,
  limit = 10,
): Promise<Array<CompanyFinancialAiAnalysis & { id: string; createdAt: string }>> {
  return apiFetch(
    `/financial/insights/ai-analysis?companyId=${encodeURIComponent(id)}&limit=${limit}`,
  );
}

export async function analyzeCompanyFinancialStatements(
  id: string,
  model: string,
): Promise<CompanyFinancialAiAnalysis> {
  return apiFetch<CompanyFinancialAiAnalysis>(
    `/financial/insights/ai-analysis?companyId=${encodeURIComponent(id)}`,
    {
      method: "POST",
      body: JSON.stringify({ model }),
    },
  );
}

export async function refreshCompanyMissing(
  id: string,
): Promise<CompanyListItem> {
  return apiFetch<CompanyListItem>(
    `/companies/${encodeURIComponent(id)}/refresh-missing`,
    {
      method: "POST",
    },
  );
}

export type CompanyRefreshMissingProgressEvent =
  | {
      type: "start";
      companyId: string;
      companyName: string;
      completed: number;
      total: number;
      message: string;
    }
	  | {
	      type: "source";
	      source: "dart" | "jobkorea" | "jasoseol" | "jobplanet" | "namu-wiki";
      label: string;
      status: "running" | "success" | "empty" | "error" | "skipped";
      completed: number;
      total: number;
      message: string;
    }
  | {
      type: "merge" | "saving";
      completed: number;
      total: number;
      message: string;
    }
  | {
      type: "done";
      completed: number;
      total: number;
      message: string;
      result: CompanyListItem;
    }
  | {
      type: "error";
      completed: number;
      total: number;
      message: string;
    };

export async function refreshCompanyMissingStream(
  id: string,
  onEvent: (event: CompanyRefreshMissingProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/companies/${encodeURIComponent(id)}/refresh-missing/stream`,
    {
      headers: getAuthHeaders(),
      signal,
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`결측치 수집 스트림 연결 실패: ${res.status} ${res.statusText}`);
  }

  await readSSE<CompanyRefreshMissingProgressEvent>(res, (event) => {
    onEvent(event);
    return event.type === "done" || event.type === "error";
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
  return apiFetch<{ total: number }>("/companies/refresh-all-missing", {
    method: "POST",
  });
}

export async function stopMissingRefresh(): Promise<void> {
  await apiFetch<{ ok: boolean }>("/companies/refresh-all-missing/stop", {
    method: "POST",
  });
}

export interface CompanyMissingRefreshStatus {
  phase: "idle" | "running" | "done" | "stopped";
  total: number;
  processed: number;
}

export async function getMissingRefreshStatus(): Promise<CompanyMissingRefreshStatus> {
  return apiFetch<CompanyMissingRefreshStatus>(
    "/companies/refresh-all-missing/status",
  );
}

export interface CompanyNewsItem {
  id?: string;
  title: string;
  url: string;
  snippet: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  fetchedAt?: string;
}

export async function getCompanyNews(
  id: string,
  limit = 50,
  offset = 0,
  sinceLatest = false,
): Promise<CompanyNewsItem[]> {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (sinceLatest) qs.set("sinceLatest", "true");
  return apiFetch<CompanyNewsItem[]>(
    `/companies/${encodeURIComponent(id)}/news?${qs.toString()}`,
  );
}

export async function getSavedCompanyNews(
  id: string,
  limit = 50,
  offset = 0,
): Promise<CompanyNewsItem[]> {
  return apiFetch<CompanyNewsItem[]>(
    `/companies/${encodeURIComponent(id)}/news/saved?limit=${limit}&offset=${offset}`,
  );
}

export interface ResetCompanyNewsResult {
  deletedNews: number;
  deletedKeywords: number;
  deletedTimeline: number;
}

export async function resetCompanyNews(
  id: string,
): Promise<ResetCompanyNewsResult> {
  return apiFetch<ResetCompanyNewsResult>(
    `/companies/${encodeURIComponent(id)}/news`,
    { method: "DELETE" },
  );
}

export interface CompanyNewsKeyword {
  keyword: string;
  category?: string;
  reason?: string;
}

export interface CompanyNewsKeywordResult {
  keywords: CompanyNewsKeyword[];
  model: string;
  sourceTitleCount: number;
  runId?: string;
  createdAt?: string;
}

export async function detectCompanyNewsKeywords(
  id: string,
  model: string,
  titles: string[],
): Promise<CompanyNewsKeywordResult> {
  return apiFetch<CompanyNewsKeywordResult>(
    `/companies/${encodeURIComponent(id)}/news/keywords`,
    {
      method: "POST",
      body: JSON.stringify({ model, titles }),
    },
  );
}

export async function getCompanyNewsKeywords(
  id: string,
): Promise<CompanyNewsKeywordResult> {
  return apiFetch<CompanyNewsKeywordResult>(
    `/companies/${encodeURIComponent(id)}/news/keywords`,
  );
}

export interface NewsTimelineEvent {
  category: string;
  summary: string;
  type:
    | "product"
    | "contract"
    | "partner"
    | "invest"
    | "hr"
    | "risk"
    | "other"
    | string;
  importance: "high" | "medium" | "low" | string;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
}

export interface NewsTimelineMonth {
  yearMonth: string;
  events: NewsTimelineEvent[];
}

export interface NewsTimelineResult {
  months: NewsTimelineMonth[];
  model: string;
  analyzedAt: string;
  newsCount: number;
  savedNewsCount: number;
  eligibleNewsCount: number;
  aiUsage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
    currency: "USD";
  };
}

export async function getNewsTimeline(id: string): Promise<NewsTimelineResult> {
  return apiFetch<NewsTimelineResult>(
    `/companies/${encodeURIComponent(id)}/news/timeline`,
  );
}

export type TimelineNewsUsageStatus =
  | "used"
  | "excluded_duplicate"
  | "excluded_missing_date"
  | "excluded_missing_title"
  | "excluded_company_name"
  | "excluded_month_limit";

export interface TimelineNewsSourceItem {
  id: string;
  title: string;
  url: string;
  snippet: string | null;
  source: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  yearMonth: string | null;
  usageStatus: TimelineNewsUsageStatus;
  usageReason: string;
  promptIndex: number | null;
  relatedEvents: {
    yearMonth: string;
    category: string;
    summary: string;
  }[];
}

export interface TimelineNewsSourcesResult {
  savedCount: number;
  eligibleCount: number;
  usedCount: number;
  excludedCount: number;
  items: TimelineNewsSourceItem[];
}

export async function getNewsTimelineSources(
  id: string,
): Promise<TimelineNewsSourcesResult> {
  return apiFetch<TimelineNewsSourcesResult>(
    `/companies/${encodeURIComponent(id)}/news/timeline/sources`,
  );
}

export interface BulkFetchResult {
  fetched: number;
  saved: number;
  hasMore: boolean;
}

export async function bulkFetchCompanyNews(
  id: string,
  companyName: string,
  round = 0,
): Promise<BulkFetchResult> {
  return apiFetch<BulkFetchResult>(
    `/companies/${encodeURIComponent(id)}/news/bulk-fetch`,
    {
      method: "POST",
      body: JSON.stringify({ companyName, round }),
    },
  );
}

export interface ScrapeHistoricalResult {
  fetched: number;
  saved: number;
  hasMore: boolean;
  dateFrom: string;
  dateTo: string;
  stopped: boolean;
  reachedStopDate: boolean;
}

export type ScrapeHistoricalProgressEvent =
  | {
      type: "start";
      companyName: string;
      message: string;
    }
  | {
      type: "window";
      attempt: number;
      maxAttempts: number;
      dateFrom: string;
      dateTo: string;
      fetched: number;
      message: string;
    }
  | {
      type: "query";
      query: string;
      dateFrom: string;
      dateTo: string;
      message: string;
    }
  | {
      type: "page";
      query: string;
      start: number;
      dateFrom: string;
      dateTo: string;
      fetched: number;
      added: number;
      rejectedByTitle: number;
      totalFetched: number;
      message: string;
    }
  | {
      type: "saving";
      fetched: number;
      message: string;
    }
  | {
      type: "done";
      result: ScrapeHistoricalResult;
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

export async function scrapeHistoricalNews(
  id: string,
  companyName: string,
  stopDate?: string,
): Promise<ScrapeHistoricalResult> {
  return apiFetch<ScrapeHistoricalResult>(
    `/companies/${encodeURIComponent(id)}/news/scrape-historical`,
    {
      method: "POST",
      body: JSON.stringify({ companyName, stopDate }),
    },
  );
}

export async function scrapeHistoricalNewsStream(
  id: string,
  companyName: string,
  onEvent: (event: ScrapeHistoricalProgressEvent) => void,
  stopDate?: string,
  signal?: AbortSignal,
): Promise<ScrapeHistoricalResult> {
  const qs = new URLSearchParams({ companyName });
  if (stopDate) qs.set("stopDate", stopDate);
  const res = await fetch(
    `${API_BASE}/companies/${encodeURIComponent(id)}/news/scrape-historical/stream?${qs.toString()}`,
    {
      headers: getAuthHeaders(),
      signal,
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`이전 뉴스 수집 스트림 연결 실패: ${res.status} ${res.statusText}`);
  }

  let result: ScrapeHistoricalResult | null = null;
  let errorMessage = "";
  await readSSE<ScrapeHistoricalProgressEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done") {
      result = event.result;
      return true;
    }
    if (event.type === "error") {
      errorMessage = event.message;
      return true;
    }
  });

  if (result) return result;
  throw new Error(errorMessage || "이전 뉴스 수집이 완료되지 않았습니다.");
}

export async function stopHistoricalNewsScrape(
  id: string,
): Promise<{ stopped: boolean }> {
  return apiFetch<{ stopped: boolean }>(
    `/companies/${encodeURIComponent(id)}/news/scrape-historical/stop`,
    { method: "POST" },
  );
}

export async function analyzeNewsTimeline(
  id: string,
  companyName: string,
  model: string,
  incremental = false,
): Promise<NewsTimelineResult> {
  return apiFetch<NewsTimelineResult>(
    `/companies/${encodeURIComponent(id)}/news/timeline/analyze`,
    {
      method: "POST",
      body: JSON.stringify({ companyName, model, incremental }),
    },
  );
}

// ── 사업 로드맵 분석 큐 ────────────────────────────────────────────────────────

export type RoadmapJobStatus = "pending" | "running" | "done" | "error" | "not_found";

export interface RoadmapJobEvent {
  type: "log" | "done" | "error";
  message?: string;
  result?: NewsTimelineResult;
}

export async function enqueueRoadmapAnalysis(
  companyId: string,
  companyName: string,
  model: string,
  incremental = false,
): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>(
    `/queue/roadmap-analysis`,
    { method: "POST", body: JSON.stringify({ companyId, companyName, model, incremental }) },
  );
}

export interface BulkFetchJobEvent {
  type: "log" | "done" | "error";
  message?: string;
  result?: BulkFetchResult;
}

export async function enqueueBulkFetchNews(
  companyId: string,
  companyName: string,
  round = 0,
): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>(
    `/queue/bulk-fetch-news`,
    { method: "POST", body: JSON.stringify({ companyId, companyName, round }) },
  );
}

export function subscribeBulkFetchNews(
  jobId: string,
  onEvent: (event: BulkFetchJobEvent) => void,
  signal?: AbortSignal,
): void {
  const url = `${API_BASE}/queue/bulk-fetch-news/${encodeURIComponent(jobId)}/stream`;
  const es = new EventSource(url);
  let settled = false;

  const cleanup = () => es.close();
  signal?.addEventListener("abort", cleanup);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as BulkFetchJobEvent;
      onEvent(data);
      if (data.type === "done" || data.type === "error") {
        settled = true;
        cleanup();
      }
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = () => {
    if (settled) return;
    onEvent({ type: "error", message: "스트림 연결 오류" });
    cleanup();
  };
}

export function subscribeRoadmapAnalysis(
  _id: string,
  jobId: string,
  onEvent: (event: RoadmapJobEvent) => void,
  signal?: AbortSignal,
): void {
  const url = `${API_BASE}/queue/roadmap-analysis/${encodeURIComponent(jobId)}/stream`;
  const es = new EventSource(url);
  let settled = false;

  const cleanup = () => es.close();
  signal?.addEventListener("abort", cleanup);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as RoadmapJobEvent;
      onEvent(data);
      if (data.type === "done" || data.type === "error") {
        settled = true;
        cleanup();
      }
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = () => {
    // done/error 이미 수신한 뒤 서버가 연결을 닫으면 onerror가 발화되므로 무시
    if (settled) return;
    onEvent({ type: "error", message: "스트림 연결 오류" });
    cleanup();
  };
}

export interface InvestorTradingRecord {
  date: string;
  individual: number | null;
  foreign: number | null;
  institutional: number | null;
}

export interface InvestorTradingData {
  stockCode: string | null;
  records: InvestorTradingRecord[];
  source: string;
  error?: string;
}

export async function getCompanyInvestorTrading(
  id: string,
  days = 30,
): Promise<InvestorTradingData> {
  return apiFetch<InvestorTradingData>(
    `/financial/investor-trading?companyId=${encodeURIComponent(id)}&days=${days}`,
  );
}

export interface ShortSellingRecord {
  date: string;
  shortVolume: number | null;
  uptickRuleVolume: number | null;
  uptickRuleExemptVolume: number | null;
  balanceVolume: number | null;
  shortAmount: number | null;
  balanceAmount: number | null;
}

export interface ShortSellingData {
  stockCode: string | null;
  records: ShortSellingRecord[];
  source: string;
  error?: string;
}

export async function getCompanyShortSelling(
  id: string,
  days = 90,
): Promise<ShortSellingData> {
  return apiFetch<ShortSellingData>(
    `/financial/short-selling?companyId=${encodeURIComponent(id)}&days=${days}`,
  );
}

export async function refreshCompanyFinancials(
  id: string,
): Promise<{ ok: boolean; count: number; financials: YearlyFinancial[] }> {
  const result = await apiFetch<{
    ok: boolean;
    count: number;
    financials: YearlyFinancial[];
  }>(`/financial/refresh-financials?companyId=${encodeURIComponent(id)}`, {
    method: "POST",
  });
  clearCompanyReadCache(id);
  return result;
}

export interface CompanyQuarterlyFinancial extends YearlyFinancial {
  quarter: number;
  reportCode: string;
  rceptNo: string | null;
  periodLabel: string;
  basisLabel: string;
}

export async function getCompanyQuarterlyFinancials(
  id: string,
  options?: RequestInit,
): Promise<CompanyQuarterlyFinancial[]> {
  const path = `/financial/quarterly?companyId=${encodeURIComponent(id)}`;
  const request = cachedApiFetch<CompanyQuarterlyFinancial[]>(
    `quarterly:${path}`,
    path,
    10 * 60_000,
  );
  return withAbortSignal(request, options?.signal);
}

export async function getCompanyCollectEnabled(): Promise<boolean> {
  const res = await apiFetch<{ enabled: boolean }>(
    "/companies/settings/collect-enabled",
  );
  return res.enabled;
}

export async function setCompanyCollectEnabled(
  enabled: boolean,
): Promise<void> {
  await apiFetch<{ enabled: boolean }>("/companies/settings/collect-enabled", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}
