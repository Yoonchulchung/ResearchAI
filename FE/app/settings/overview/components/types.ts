type TavilyUsageBreakdown = {
  usage: number;
  limit: number | null;
  search_usage: number;
  crawl_usage: number;
  extract_usage: number;
  map_usage: number;
  research_usage: number;
};

export type TavilyOverview = {
  configured: boolean;
  usage: {
    key: TavilyUsageBreakdown;
    account: TavilyUsageBreakdown & {
      current_plan: string;
      plan_usage: number;
      plan_limit: number | null;
      paygo_usage: number;
      paygo_limit: number | null;
    };
  } | null;
  apiKey: string | null;
};

export type AnthropicUsage = {
  configured: boolean;
  data: {
    period: { from: string; to: string };
    totals: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens: number;
      cache_creation_input_tokens: number;
    };
    daily: any[];
  } | null;
  error?: string;
};

export function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
