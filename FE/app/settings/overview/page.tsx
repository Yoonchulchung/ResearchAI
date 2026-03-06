"use client";

import { useEffect, useState, useCallback } from "react";
import { getTavilyOverview, getAnthropicUsage, getApiKeys, type ApiKeyEntry } from "@/lib/api";
import {
  type TavilyOverview,
  type AnthropicUsage,
  PageHeader,
  TavilyCard,
  AnthropicCard,
  ApiKeysTable,
} from "./components";

export default function OverviewPage() {
  const [tavily, setTavily] = useState<TavilyOverview | null>(null);
  const [anthropic, setAnthropic] = useState<AnthropicUsage | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.allSettled([getTavilyOverview(), getAnthropicUsage(), getApiKeys()]).then(
      ([tavilyRes, anthropicRes, apiKeysRes]) => {
        if (tavilyRes.status === "fulfilled") setTavily(tavilyRes.value);
        if (anthropicRes.status === "fulfilled") setAnthropic(anthropicRes.value);
        if (apiKeysRes.status === "fulfilled") setApiKeys(apiKeysRes.value);
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader loading={loading} />

      <div className="px-8 py-8 space-y-6 max-w-4xl mx-auto">
        <TavilyCard loading={loading} tavily={tavily} />
        <AnthropicCard loading={loading} anthropic={anthropic} />
        <ApiKeysTable loading={loading} apiKeys={apiKeys} onRefresh={fetchAll} />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Have any questions, feedback or need support? We&apos;d love to hear from you!
          </p>
          <button className="px-5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Contact us
          </button>
        </div>
      </div>
    </div>
  );
}
