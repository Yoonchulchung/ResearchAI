"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeTarget } from "@/lib/api/resume";
import { patchResumeCompanyLink } from "@/lib/api/resume";
import {
  getCompanyNews,
  upsertCompanyNewsItem,
  deepSearchCompanyNewsItem,
  deleteCompanyNews,
  deleteCompanyNewsByResume,
} from "@/lib/api/recruit/company-news";
import { getCompany } from "@/lib/api/companies";
import {
  enqueueLightResearch,
  subscribeLightResearch,
  type LightResearchEvent,
} from "@/lib/api/research";
import type { Task } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { MODELS } from "@/recruit/_constants";
import { NewsItemCard } from "./NewsItemCard";
import type { NewsItemState } from "./types";
import { CompanyLinkedPanel } from "./CompanyLinkedPanel";

// ── 기업 연결 입력 ────────────────────────────────────────────────────────────
function CompanyLinkInput({
  resumeId,
  onLinked,
}: {
  resumeId: string;
  onLinked: (companyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const id = value.trim();
    if (!id) return;
    setSaving(true);
    try {
      await patchResumeCompanyLink(resumeId, id);
      onLinked(id);
      setOpen(false);
      setValue("");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-indigo-400 hover:text-indigo-600 underline underline-offset-2"
      >
        + 기업 연결
      </button>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        placeholder="기업 ID 붙여넣기"
        className="flex-1 h-7 rounded border border-slate-200 px-2 text-xs outline-none focus:border-indigo-300"
      />
      <button
        onClick={handleSave}
        disabled={saving || !value.trim()}
        className="h-7 px-2 rounded bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40"
      >
        {saving ? "..." : "연결"}
      </button>
      <button
        onClick={() => { setOpen(false); setValue(""); }}
        className="h-7 px-1.5 text-slate-400 hover:text-slate-600"
      >
        ✕
      </button>
    </div>
  );
}

// ── 메인 패널 ─────────────────────────────────────────────────────────────────
export function CompanyNewsPanel({
  target,
  resumeId,
}: {
  target: ResumeTarget;
  resumeId: string;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NewsItemState[]>([]);
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(
    () => user?.defaultCloudModel ?? MODELS[0].id,
  );
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const deepAbortRefs = useRef<Map<string, AbortController>>(new Map());

  // target.companyId가 UUID인지 확인, 구형 데이터엔 회사명이 들어있을 수 있어 canonical ID로 교정
  useEffect(() => {
    const linked = target.companyId?.trim();
    if (!linked) { setCompanyId(null); return; }

    let cancelled = false;
    setResolving(true);
    getCompany(linked)
      .then((company) => {
        if (cancelled) return;
        const canonical = company?.id ?? linked;
        setCompanyId(canonical);
        if (company?.id && company.id !== linked) {
          patchResumeCompanyLink(resumeId, company.id).catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) setCompanyId(linked); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [resumeId, target.companyId]);

  // 기업 미연결 시 저장된 뉴스 로드
  useEffect(() => {
    if (!resumeId || !target.companyName) return;
    getCompanyNews(resumeId, target.companyName)
      .then((rows) => {
        if (!rows.length) return;
        setItems(rows.map((row) => ({ ...row, detailResult: row.detailJson ?? undefined })));
      })
      .catch(() => {});
  }, [resumeId, target.companyName]);

  const handleSearch = useCallback(async () => {
    if (!target.companyName?.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setLog("");

    try {
      const topic = `${target.companyName} 최신 뉴스 및 동향`;
      const { searchId } = await enqueueLightResearch({
        topic,
        localAIModel: "",
        cloudAIModel: selectedModel,
        webModel: selectedModel,
        searchMode: "web",
      });

      let doneTasks: Task[] = [];
      await subscribeLightResearch(
        searchId,
        (event: LightResearchEvent) => {
          if (ctrl.signal.aborted) return;
          if (event.type === "log") setLog(event.message);
          if (event.type === "done") { doneTasks = event.tasks; setLoading(false); }
        },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;

      if (resumeId && target.companyName) {
        await deleteCompanyNewsByResume(resumeId, target.companyName).catch(() => {});
      }

      const saved: NewsItemState[] = [];
      for (let i = 0; i < doneTasks.length; i++) {
        const t = doneTasks[i];
        const itemId = t.itemId ?? String(i);
        try {
          const row = await upsertCompanyNewsItem(resumeId, {
            companyName: target.companyName,
            itemId,
            title: t.title,
            searchQuery: t.webSearchPrompt ?? t.title,
            searchId,
          });
          saved.push({ ...row, detailResult: undefined });
        } catch {
          saved.push({
            id: itemId, resumeId, companyName: target.companyName,
            searchId, itemId, title: t.title,
            searchQuery: t.webSearchPrompt ?? t.title,
            detailJson: null, createdAt: "", updatedAt: "",
          });
        }
      }
      setItems(saved);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : "뉴스 검색 중 오류가 발생했습니다.");
        setLoading(false);
      }
    }
  }, [target.companyName, selectedModel, resumeId]);

  const handleDeepSearch = useCallback(async (item: NewsItemState) => {
    deepAbortRefs.current.get(item.id)?.abort();
    const ctrl = new AbortController();
    deepAbortRefs.current.set(item.id, ctrl);
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, detailLoading: true, detailError: null } : it));
    try {
      const result = await deepSearchCompanyNewsItem(
        item.id,
        { query: item.searchQuery || item.title, model: selectedModel },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setItems((prev) => prev.map((it) =>
        it.id === item.id ? { ...it, detailResult: result.aiResult, detailLoading: false, detailError: null } : it,
      ));
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const msg = e instanceof Error ? e.message : "세부 검색 중 오류";
        setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, detailLoading: false, detailError: msg } : it));
      }
    }
  }, [selectedModel]);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    deleteCompanyNews(id).catch(() => {});
  }, []);

  const handleUnlink = useCallback(async () => {
    await patchResumeCompanyLink(resumeId, null).catch(() => {});
    setCompanyId(null);
  }, [resumeId]);

  // 기업 연결 완료 → CompanyLinkedPanel (탭 UI)
  if (resolving) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-slate-400">기업 연결 확인 중...</p>
      </div>
    );
  }

  if (companyId) {
    return (
      <CompanyLinkedPanel
        companyId={companyId}
        companyName={target.companyName}
        onUnlink={handleUnlink}
      />
    );
  }

  // 기업 미연결 → 기존 검색 UI
  const hasCompany = !!target.companyName?.trim();
  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          {target.companyName && (
            <span className="text-sm font-bold text-slate-700">{target.companyName}</span>
          )}
          <CompanyLinkInput resumeId={resumeId} onLinked={setCompanyId} />
        </div>
        <div className="flex gap-1.5">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loading}
            className="h-8 flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300 disabled:opacity-50"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            disabled={loading || !hasCompany}
            className="shrink-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />
                {log ? <span className="truncate max-w-20">{log}</span> : "검색 중..."}
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                {items.length > 0 ? "재검색" : "검색"}
              </>
            )}
          </button>
        </div>
        {!hasCompany && (
          <p className="text-xs text-slate-400">기업명을 입력하면 뉴스를 검색할 수 있습니다.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : items.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
              <rect x="3" y="5" width="26" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 11h16M8 16h12M8 21h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-400">기업 관련 최신 뉴스를<br />AI로 검색합니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <NewsItemCard key={item.id} item={item} onDeepSearch={handleDeepSearch} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
