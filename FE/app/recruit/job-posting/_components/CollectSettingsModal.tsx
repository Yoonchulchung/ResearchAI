"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CollectDetailConfig } from "@/lib/api/recruit/job-posting";
import { previewCollectCount } from "@/lib/api/recruit/job-posting";

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", desc: "균형 · 권장" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7", desc: "최고 성능 · 느림" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", desc: "빠름 · 저렴" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "무료 할당량 있음" },
] as const;

const COMPANY_TYPES = ["대기업", "중견기업", "중소기업", "금융권", "외국계기업"];
const JOB_TYPES = ["신입", "인턴", "경력", "계약직"];
const CATEGORIES = ["IT", "전자"];

interface CollectSettingsModalProps {
  open: boolean;
  config: CollectDetailConfig;
  onChange: (config: CollectDetailConfig) => void;
  onClose: () => void;
  onStart: () => void;
  collectLoading: boolean;
}

function toggleItem(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function CollectSettingsModal({
  open,
  config,
  onChange,
  onClose,
  onStart,
  collectLoading,
}: CollectSettingsModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback((cfg: CollectDetailConfig) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { total } = await previewCollectCount(cfg);
        setPreview(total);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
  }, []);

  useEffect(() => {
    if (open) fetchPreview(config);
  }, [open]);

  useEffect(() => {
    if (open) fetchPreview(config);
  }, [config, open, fetchPreview]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const companyTypes = config.companyTypes ?? [];
  const jobTypes = config.jobTypes ?? [];
  const jobs = config.jobs ?? [];

  const handleStart = () => { onStart(); onClose(); };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-amber-500">
              <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">AI 상세 수집 설정</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 예상 수집 건수 */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">예상 수집 건수</span>
            {previewLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
            ) : preview !== null ? (
              <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{preview.toLocaleString()}건</span>
            ) : (
              <span className="text-xs text-slate-400">-</span>
            )}
          </div>

          {/* 기업 규모 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              기업 규모 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_TYPES.map((ct) => {
                const active = companyTypes.includes(ct);
                return (
                  <button
                    key={ct}
                    onClick={() => onChange({ ...config, companyTypes: toggleItem(companyTypes, ct) })}
                    className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition-all ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {ct}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 공고 유형 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              공고 유형 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {JOB_TYPES.map((jt) => {
                const active = jobTypes.includes(jt);
                return (
                  <button
                    key={jt}
                    onClick={() => onChange({ ...config, jobTypes: toggleItem(jobTypes, jt) })}
                    className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition-all ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {jt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 직무 분야 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              직무 분야 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const active = jobs.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => onChange({ ...config, jobs: toggleItem(jobs, cat) })}
                    className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition-all ${
                      active
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI 모델 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">AI 모델</label>
            <div className="space-y-1.5">
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => onChange({ ...config, model: m.value })}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition-all ${
                    config.model === m.value
                      ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-500"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800/50"
                  }`}
                >
                  <div>
                    <p className={`text-xs font-semibold ${config.model === m.value ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"}`}>
                      {m.label}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{m.desc}</p>
                  </div>
                  {config.model === m.value && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
                      <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 옵션들 */}
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            {/* Skip existing */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">이미 수집된 항목 건너뛰기</p>
                <p className="text-[11px] text-slate-400 mt-0.5">DB에 저장되고 내용이 있는 공고는 재수집 안 함</p>
              </div>
              <button
                onClick={() => onChange({ ...config, skipExisting: !config.skipExisting })}
                className={`relative w-9 h-5 rounded-sm transition-colors shrink-0 ml-3 ${(config.skipExisting ?? true) ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-sm bg-white shadow transition-transform ${(config.skipExisting ?? true) ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>

            {/* VLM */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">이미지 텍스트 추출 (VLM)</p>
                <p className="text-[11px] text-slate-400 mt-0.5">공고 이미지에서 AI로 텍스트 추출</p>
              </div>
              <button
                onClick={() => onChange({ ...config, enableVlm: !config.enableVlm })}
                className={`relative w-9 h-5 rounded-sm transition-colors shrink-0 ml-3 ${config.enableVlm ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-sm bg-white shadow transition-transform ${config.enableVlm ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
          </div>

          {/* 최대 건수 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              최대 수집 건수 <span className="font-normal text-slate-400">(0 = 전체)</span>
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={config.maxItems ?? 0}
              onChange={(e) => onChange({ ...config, maxItems: Math.max(0, Number(e.target.value)) })}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
              placeholder="0"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex gap-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleStart}
            disabled={collectLoading || preview === 0}
            className="flex-1 py-2 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {collectLoading ? (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            )}
            {preview !== null && preview > 0 ? `${preview}건 수집 시작` : "수집 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}
