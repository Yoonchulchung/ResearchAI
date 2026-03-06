import { apiFetch } from "./base";

export const getPromptTemplates = () =>
  apiFetch<{ generateTasks: string; system: string; ollamaFilter: string }>("/overview/prompts");

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface ApiKeyEntry {
  key: string;
  label: string;
  masked: string | null;
  configured: boolean;
}

export const getApiKeys = () =>
  apiFetch<ApiKeyEntry[]>("/overview/api-keys");

export const updateApiKey = (key: string, value: string) =>
  apiFetch<{ ok: boolean }>("/overview/api-keys", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });

// ── Usage / Status ────────────────────────────────────────────────────────────

export const getAnthropicUsage = () =>
  apiFetch<{
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
  }>("/overview/anthropic/usage");

export const getTavilyOverview = () =>
  apiFetch<{
    configured: boolean;
    usage: {
      key: { usage: number; limit: number | null; search_usage: number; crawl_usage: number; extract_usage: number; map_usage: number; research_usage: number };
      account: { current_plan: string; plan_usage: number; plan_limit: number | null; search_usage: number; crawl_usage: number; extract_usage: number; map_usage: number; research_usage: number; paygo_usage: number; paygo_limit: number | null };
    } | null;
    apiKey: string | null;
  }>("/overview/tavily");

export const getPipelineStatus = () =>
  apiFetch<{ tavily: boolean; serper: boolean; naver: boolean; brave: boolean; ollama: boolean }>(
    "/overview/pipeline-status",
  );
