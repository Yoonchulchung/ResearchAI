"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api/base";

function pdfProxyUrl(disclosureUrl: string) {
  return `${API_BASE}/financial/disclosures/pdf?url=${encodeURIComponent(disclosureUrl)}`;
}

export function DisclosurePdfViewer() {
  const searchParams = useSearchParams();
  const disclosureUrl = searchParams.get("url") ?? "";
  const title = searchParams.get("title") ?? "공시 문서";

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proxyUrl = useMemo(() => (disclosureUrl ? pdfProxyUrl(disclosureUrl) : ""), [disclosureUrl]);

  useEffect(() => {
    let objectUrl: string | null = null;
    const ctrl = new AbortController();

    setPdfBlobUrl(null);
    setError(null);

    if (!proxyUrl) {
      setError("공시 URL이 없습니다.");
      return () => ctrl.abort();
    }

    setLoading(true);
    fetch(proxyUrl, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let msg = `PDF를 불러오지 못했습니다. (HTTP ${res.status})`;
          try {
            const json = JSON.parse(text);
            if (json.message) msg = json.message;
          } catch {}
          throw new Error(msg);
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "PDF를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proxyUrl]);

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <header className="flex-none border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">DART 공시</p>
            <h1 className="truncate text-sm font-black text-slate-900">{title}</h1>
          </div>
          {disclosureUrl ? (
            <Link
              href={disclosureUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
            >
              원문 공시
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {loading ? (
          <p className="text-sm text-slate-500">PDF를 불러오는 중입니다…</p>
        ) : error ? (
          <p className="rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-600">{error}</p>
        ) : pdfBlobUrl ? (
          <iframe
            src={pdfBlobUrl}
            className="h-full w-full border-0"
            title={title}
          />
        ) : null}
      </div>
    </div>
  );
}
