"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  type ResumeExperience,
  type ResumePrize,
  type ResumeProfile,
  type ResumeSelfIntro,
  type ResumeTarget,
  type ResumeTraining,
} from "@/lib/api/resume";
import { API_BASE, getAuthHeaders } from "@/lib/api/base";
import { streamWriteAssist } from "@/lib/api/ai";
import { enqueueRecruitAssist } from "@/lib/api/recruit/assist";
import { IconEvaluate } from "../../../_components/icons";
import { MODELS } from "../../../_constants";

function uid() {
  return Math.random().toString(36).slice(2);
}

const ACTIVITY_TYPES = [
  "선택안함",
  "동아리활동",
  "연구회",
  "팀 프로젝트",
  "온라인 커뮤니티",
  "재능기부 활동",
  "기타사회활동",
];

const OVERSEAS_PURPOSES = [
  "선택안함",
  "어학연수",
  "해외연수",
  "교환학생",
  "세미나",
  "해외거주",
  "해외봉사",
  "기타",
];

const COUNTRY_CODES = [
  "GH", "GA", "GY", "GM", "GG", "GP", "GT", "GU", "GD", "GR", "GL", "GN", "GW",
  "NA", "NR", "NG", "SS", "ZA", "NL", "NP", "NO", "NF", "NZ", "NC", "NU", "NE", "NI",
  "TW", "KR", "DK", "DM", "DO", "DE", "TL", "LA", "LR", "LV", "RU", "LB", "LS", "RO",
  "LU", "LT", "LI", "MG", "MH", "YT", "MO", "MW", "MY", "ML", "IM", "MX", "MC", "MA",
  "MU", "MR", "MZ", "ME", "MS", "MD", "MV", "MT", "MN", "US", "UM", "VI", "MM", "FM",
  "VU", "BH", "BB", "VA", "BS", "BD", "BM", "BJ", "VE", "VN", "BE", "BY", "BZ", "BA",
  "BW", "BO", "BI", "BF", "BT", "MP", "MK", "BG", "BR", "BN", "WS", "SA", "GS", "SM",
  "ST", "PM", "EH", "SN", "RS", "SC", "LC", "VC", "KN", "SH", "SO", "SB", "SD", "SR",
  "LK", "SJ", "SZ", "SE", "CH", "ES", "SK", "SI", "SY", "SL", "SG", "AE", "AW", "AM",
  "AR", "AS", "IS", "HT", "IE", "AZ", "AF", "AD", "AL", "DZ", "AO", "AG", "AI", "ER",
  "EE", "EC", "ET", "SV", "GB", "VG", "IO", "YE", "OM", "AU", "AT", "HN", "AX", "WF",
  "JO", "UG", "UY", "UZ", "UA", "IQ", "IR", "IL", "EG", "IT", "IN", "ID", "JP", "JM",
  "ZM", "JE", "GQ", "KP", "GE", "CN", "CF", "DJ", "GI", "ZW", "TD", "CZ", "CL", "CM",
  "CV", "KZ", "QA", "KH", "CA", "KE", "KY", "KM", "CR", "CC", "CI", "CO", "CG", "CD",
  "CU", "KW", "CK", "CW", "HR", "CX", "KG", "KI", "CY", "TJ", "TZ", "TH", "TC", "TR",
  "TG", "TK", "TO", "TM", "TV", "TN", "TT", "PA", "PY", "PK", "PG", "PW", "PS", "FO",
  "PE", "PT", "FK", "PL", "PR", "FR", "GF", "TF", "PF", "FJ", "FI", "PH", "PN", "HM",
  "HU", "HK",
];

const COUNTRY_NAMES = (() => {
  const displayNames = new Intl.DisplayNames(["ko"], { type: "region" });
  return COUNTRY_CODES
    .map((code) => displayNames.of(code))
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b, "ko"));
})();

type SpellcheckChangeStatus = "pending" | "accepted" | "rejected";

interface SpellcheckChange {
  id: string;
  before: string;
  after: string;
  start: number;
  end: number;
  status: SpellcheckChangeStatus;
}

interface SpellcheckState {
  loading: boolean;
  baseText: string;
  correctedText: string;
  rawResult: string;
  changes: SpellcheckChange[];
  error: string | null;
}

function stripMarkdownFence(text: string) {
  let value = text.trim();
  if (value.startsWith("```")) {
    value = value.replace(/^```[^\n\r]*(?:\r?\n)?/, "");
    value = value.replace(/\r?\n?```\s*$/, "");
  }
  return value.trim();
}

function extractCorrectedSpellcheckText(result: string, fallback: string) {
  const text = stripMarkdownFence(result);
  let body = text;

  const startMatch = body.match(/#{1,6}\s*📝?\s*교정된 문서/);
  if (startMatch?.index !== undefined) body = body.slice(startMatch.index + startMatch[0].length);
  const tableMatch = body.match(/#{1,6}\s*🔍?\s*교정 내역/);
  if (tableMatch?.index !== undefined) body = body.slice(0, tableMatch.index);
  const dividerIndex = body.search(/\n-{3,}\s*(?:\n|$)/);
  if (dividerIndex >= 0) body = body.slice(0, dividerIndex);

  body = body.replace(/^\s*```[^\n\r]*(?:\r?\n)?/, "").replace(/\r?\n?```\s*$/, "").trim();
  return body || fallback;
}

function tokenizeForDiff(text: string) {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function buildSpellcheckChanges(original: string, corrected: string): SpellcheckChange[] {
  if (original === corrected) return [];

  const a = tokenizeForDiff(original);
  const b = tokenizeForDiff(corrected);
  const offsets = a.reduce<number[]>((acc, token) => {
    const previous = acc.length === 0 ? 0 : acc[acc.length - 1] + a[acc.length - 1].length;
    acc.push(previous);
    return acc;
  }, []);
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const changes: SpellcheckChange[] = [];
  let i = 0;
  let j = 0;
  let deleted: string[] = [];
  let inserted: string[] = [];
  let hunkStartToken: number | null = null;

  const flush = () => {
    const start = hunkStartToken === null ? original.length : offsets[hunkStartToken] ?? original.length;
    const end = hunkStartToken === null ? original.length : (i < a.length ? offsets[i] : original.length);
    const before = original.slice(start, end) || deleted.join("");
    const after = inserted.join("");
    if (before !== after && (before.trim() || after.trim())) {
      changes.push({ id: uid(), before, after, start, end, status: "pending" });
    }
    deleted = [];
    inserted = [];
    hunkStartToken = null;
  };

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      if (hunkStartToken === null) hunkStartToken = i;
      inserted.push(b[j]);
      j += 1;
    } else if (i < a.length) {
      if (hunkStartToken === null) hunkStartToken = i;
      deleted.push(a[i]);
      i += 1;
    }
  }
  flush();

  return changes;
}

function applySpellcheckChanges(baseText: string, changes: SpellcheckChange[]) {
  let next = "";
  let cursor = 0;
  const ordered = [...changes].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const change of ordered) {
    next += baseText.slice(cursor, change.start);
    next += change.status === "accepted" ? change.after : baseText.slice(change.start, change.end);
    cursor = change.end;
  }
  return next + baseText.slice(cursor);
}

function createResumeTarget(): ResumeTarget {
  return {
    id: uid(),
    companyName: "",
    jobTitle: "",
    appliedAt: "",
    jd: "",
    selfIntroductions: [],
    experiences: [],
    prizes: [],
    trainings: [],
  };
}

function createResumeExperience(activityType = ""): ResumeExperience {
  return {
    id: uid(),
    activityType,
    organizationName: "",
    startDate: "",
    endDate: "",
    role: "",
    description: "",
  };
}

function createResumePrize(): ResumePrize {
  return {
    id: uid(),
    title: "",
    organization: "",
    issuedDate: "",
    description: "",
  };
}

function createResumeTraining(): ResumeTraining {
  return {
    id: uid(),
    title: "",
    institution: "",
    startDate: "",
    endDate: "",
    hours: "",
    description: "",
  };
}

async function extractJdTextFromImage(file: File, model: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);

  const enqueueRes = await fetch(`${API_BASE}/queue/image-ocr/enqueue`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  const enqueueRaw = await enqueueRes.json().catch(() => ({}));
  const enqueueData = enqueueRaw?.isSuccess === true && "result" in enqueueRaw ? enqueueRaw.result : enqueueRaw;
  if (!enqueueRes.ok) {
    throw new Error(typeof enqueueData?.message === "string" ? enqueueData.message : "이미지 OCR 요청에 실패했습니다.");
  }
  const { jobId } = enqueueData as { jobId: string };

  return new Promise<string>((resolve, reject) => {
    const headers = getAuthHeaders() as Record<string, string>;
    const ctrl = new AbortController();
    let fullText = "";

    fetch(`${API_BASE}/queue/image-ocr/${jobId}/stream`, { headers, signal: ctrl.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) throw new Error("SSE 연결 실패");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const event = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; message?: string };
              if (event.type === "chunk" && event.text) {
                fullText += event.text;
              } else if (event.type === "done") {
                ctrl.abort();
                resolve(fullText.trim());
                return;
              } else if (event.type === "error") {
                ctrl.abort();
                reject(new Error(event.message ?? "OCR 오류"));
                return;
              }
            } catch {
              // Ignore malformed SSE chunks.
            }
          }
        }
        resolve(fullText.trim());
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") reject(error);
      });
  });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-5 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{children}</h2>;
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center text-slate-300 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function SpellcheckButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
    >
      맞춤법
    </button>
  );
}

function InlineSpellcheckPanel({
  state,
  onAccept,
  onReject,
  onApplyAll,
  onClose,
}: {
  state?: SpellcheckState;
  onAccept: (changeId: string) => void;
  onReject: (changeId: string) => void;
  onApplyAll: () => void;
  onClose: () => void;
}) {
  if (!state) return null;

  const pendingCount = state.changes.filter((change) => change.status === "pending").length;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {state.loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-100 border-t-indigo-600 animate-spin" />}
          <span className="text-xs font-black text-slate-700">맞춤법 교정</span>
          {!state.loading && !state.error && (
            <span className="text-xs font-semibold text-slate-400">
              {state.changes.length > 0 ? `${pendingCount}개 대기` : "수정 제안 없음"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {state.changes.length > 0 && (
            <button
              type="button"
              onClick={onApplyAll}
              disabled={state.loading || pendingCount === 0}
              className="h-7 rounded-sm border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              전체 적용
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="맞춤법 교정 닫기"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {state.loading ? (
        <p className="mt-3 text-xs font-medium text-slate-400">AI가 맞춤법과 띄어쓰기 오류만 확인하고 있습니다.</p>
      ) : state.error ? (
        <p className="mt-3 text-xs font-semibold text-red-500">{state.error}</p>
      ) : state.changes.length === 0 ? (
        <p className="mt-3 text-xs font-medium text-slate-500">명확한 맞춤법 오류가 발견되지 않았습니다.</p>
      ) : (
        <div className="mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {state.changes.map((change) => {
            const accepted = change.status === "accepted";
            const rejected = change.status === "rejected";
            return (
              <div
                key={change.id}
                className={`rounded-sm border px-3 py-2 ${
                  accepted
                    ? "border-emerald-200 bg-emerald-50/60"
                    : rejected
                      ? "border-slate-200 bg-slate-50 opacity-70"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="grid gap-1.5 text-sm leading-6">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-rose-50 text-xs font-black text-rose-600">-</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words text-slate-500 line-through decoration-rose-300">{change.before || "(추가)"}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-emerald-50 text-xs font-black text-emerald-700">+</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words font-semibold text-slate-800">{change.after || "(삭제)"}</span>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => onReject(change.id)}
                    disabled={rejected || accepted}
                    className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-200 bg-white text-sm font-black text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="교정 제안 거절"
                    title="거절"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => onAccept(change.id)}
                    disabled={accepted || rejected}
                    className="flex h-7 w-7 items-center justify-center rounded-sm border border-emerald-200 bg-emerald-50 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="교정 제안 적용"
                    title="적용"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TextEvaluateButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-2.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <IconEvaluate />
      글 평가
    </button>
  );
}

function Field({ label, value, onChange, placeholder, multiline, rows }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {

  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value])

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs font-bold text-slate-600">{label}</span>}
      {multiline ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 5}
          className="resize-y rounded-md border border-slate-300 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
      )}
    </div>
  );
}

function InlineField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_minmax(0,1fr)] md:items-start">
      <label className="pt-3 text-sm font-bold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function BlockField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 xl:col-span-2">
      <label className="text-sm font-bold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function ActivityInput({
  value,
  onChange,
  placeholder,
  multiline,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows ?? 6}
        className="min-h-36 w-full resize-y rounded-sm border-0 bg-slate-100 px-4 py-4 text-sm leading-relaxed text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600"
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-12 w-full rounded-sm border-0 bg-slate-100 px-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600"
    />
  );
}

function ActivitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const hasCustomValue = value && !ACTIVITY_TYPES.includes(value);
  return (
    <select
      value={value || "선택안함"}
      onChange={(event) => onChange(event.target.value === "선택안함" ? "" : event.target.value)}
      className="h-12 w-full rounded-sm border border-slate-300 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600"
    >
      {hasCustomValue && <option value={value}>{value}</option>}
      {ACTIVITY_TYPES.map((type) => (
        <option key={type} value={type}>
          {type === "선택안함" ? "활동 구분을 선택해주세요." : type}
        </option>
      ))}
    </select>
  );
}

function OverseasPurposeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value || "선택안함";

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between rounded-sm border border-slate-300 bg-slate-50 px-4 text-left text-sm text-slate-800 outline-none transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600"
      >
        <span className={value ? "" : "text-slate-400"}>{value || "해외경험 목적을 선택해주세요."}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-slate-700">
          <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-md border border-slate-300 bg-white py-3 shadow-xl">
          {OVERSEAS_PURPOSES.map((purpose) => (
            <button
              key={purpose}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(purpose === "선택안함" ? "" : purpose);
                setOpen(false);
              }}
              className={`block w-full px-6 py-3 text-left text-sm font-semibold transition-colors hover:bg-slate-50 ${
                selected === purpose ? "text-slate-950" : "text-slate-700"
              }`}
            >
              {purpose}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = [
    "선택안함",
    ...(value && !COUNTRY_NAMES.includes(value) ? [value] : []),
    ...COUNTRY_NAMES,
  ];
  const filtered = query.trim()
    ? options.filter((country) => country.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between rounded-sm border border-slate-300 bg-slate-50 px-4 text-left text-sm text-slate-800 outline-none transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600"
      >
        <span className={value ? "" : "text-slate-400"}>{value || "해외경험 국가를 선택해주세요."}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-slate-700">
          <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[26rem] overflow-y-auto rounded-md border border-slate-300 bg-white p-3 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white pb-3">
            <div className="flex h-11 items-center gap-2 rounded-sm bg-slate-100 px-3">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" className="shrink-0 text-slate-400">
                <circle cx="7.2" cy="7.2" r="4.7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M10.8 10.8L14.2 14.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="국가 검색"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="py-2">
            {filtered.map((country) => (
              <button
                key={country}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(country === "선택안함" ? "" : country);
                  setQuery("");
                  setOpen(false);
                }}
                className={`block w-full px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-slate-50 ${
                  (value || "선택안함") === country ? "text-slate-950" : "text-slate-700"
                }`}
              >
                {country}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-sm font-semibold text-slate-400">검색 결과가 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityDateRange({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <input
        type="date"
        value={startDate}
        onChange={(event) => onStartChange(event.target.value)}
        className="h-12 min-w-0 rounded-sm border-0 bg-slate-100 px-3 text-sm text-slate-800 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-600"
      />
      <span className="text-sm font-bold text-slate-400">~</span>
      <input
        type="date"
        value={endDate}
        onChange={(event) => onEndChange(event.target.value)}
        className="h-12 min-w-0 rounded-sm border-0 bg-slate-100 px-3 text-sm text-slate-800 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-600"
      />
    </div>
  );
}

function ActivityDateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full rounded-sm border-0 bg-slate-100 px-3 text-sm text-slate-800 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-600"
    />
  );
}

function ActivityTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ActivityInput
      value={value}
      onChange={onChange}
      placeholder="활동 내용을 상세히 입력해주세요."
      rows={6}
      multiline
    />
  );
}

function DateField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
      />
    </div>
  );
}

export default function ResumeEdit({
  profile,
  update,
  activeTargetId,
  setActiveTargetId,
  hideTargetSelector = false,
  model,
  onEvaluate,
  onEvaluateText,
  onGuide,
}: {
  profile: ResumeProfile;
  update: (patch: Partial<ResumeProfile>) => void;
  activeTargetId: string | null;
  setActiveTargetId: (id: string) => void;
  hideTargetSelector?: boolean;
  model?: string;
  onEvaluate?: (si: ResumeSelfIntro, index: number) => void;
  onEvaluateText?: (subjectKey: string, title: string, content: string) => void;
  onGuide?: (si: ResumeSelfIntro, index: number) => void;
}) {
  const targets = profile.resumeTargets && profile.resumeTargets.length > 0 ? profile.resumeTargets : [createResumeTarget()];
  const activeTarget = targets.find((target) => target.id === activeTargetId) ?? targets[0];
  const [jdDragOver, setJdDragOver] = useState(false);
  const [jdImageLoading, setJdImageLoading] = useState(false);
  const [jdImageError, setJdImageError] = useState<string | null>(null);
  const [jdOcrModel, setJdOcrModel] = useState(MODELS[0].id);
  const [spellchecks, setSpellchecks] = useState<Record<string, SpellcheckState>>({});

  const updateTargets = (nextTargets: ResumeTarget[]) => update({ resumeTargets: nextTargets });
  const updateActiveTarget = (patch: Partial<ResumeTarget>) => {
    updateTargets(targets.map((target) => target.id === activeTarget.id ? { ...target, ...patch } : target));
  };
  const addTarget = () => {
    const target = createResumeTarget();
    updateTargets([...targets, target]);
    setActiveTargetId(target.id);
  };
  const activeExperiences = activeTarget.experiences ?? [];
  const activePrizes = activeTarget.prizes ?? [];
  const activeTrainings = activeTarget.trainings ?? [];
  const updateExperienceAt = (index: number, patch: Partial<ResumeExperience>) => {
    const experiences = [...activeExperiences];
    experiences[index] = { ...experiences[index], ...patch };
    updateActiveTarget({ experiences });
  };
  const removeExperienceAt = (index: number) => {
    updateActiveTarget({ experiences: activeExperiences.filter((_, i) => i !== index) });
  };
  const addExperience = (activityType = "") => {
    updateActiveTarget({ experiences: [...activeExperiences, createResumeExperience(activityType)] });
  };
  const updatePrizeAt = (index: number, patch: Partial<ResumePrize>) => {
    const prizes = [...activePrizes];
    prizes[index] = { ...prizes[index], ...patch };
    updateActiveTarget({ prizes });
  };
  const removePrizeAt = (index: number) => {
    updateActiveTarget({ prizes: activePrizes.filter((_, i) => i !== index) });
  };
  const addPrize = () => {
    updateActiveTarget({ prizes: [...activePrizes, createResumePrize()] });
  };
  const movePrizeAt = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activePrizes.length) return;
    const prizes = [...activePrizes];
    [prizes[index], prizes[targetIndex]] = [prizes[targetIndex], prizes[index]];
    updateActiveTarget({ prizes });
  };
  const updateTrainingAt = (index: number, patch: Partial<ResumeTraining>) => {
    const trainings = [...activeTrainings];
    trainings[index] = { ...trainings[index], ...patch };
    updateActiveTarget({ trainings });
  };
  const removeTrainingAt = (index: number) => {
    updateActiveTarget({ trainings: activeTrainings.filter((_, i) => i !== index) });
  };
  const addTraining = () => {
    updateActiveTarget({ trainings: [...activeTrainings, createResumeTraining()] });
  };
  const moveTrainingAt = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeTrainings.length) return;
    const trainings = [...activeTrainings];
    [trainings[index], trainings[targetIndex]] = [trainings[targetIndex], trainings[index]];
    updateActiveTarget({ trainings });
  };
  const addSelfIntro = () => {
    updateActiveTarget({
      selfIntroductions: [...activeTarget.selfIntroductions, { id: uid(), question: "", answer: "" }],
    });
  };

  const runSpellcheck = async (fieldKey: string, text: string) => {
    const baseText = text;
    if (!baseText.trim()) return;
    if (spellchecks[fieldKey]?.loading) return;

    setSpellchecks((prev) => ({
      ...prev,
      [fieldKey]: {
        loading: true,
        baseText,
        correctedText: "",
        rawResult: "",
        changes: [],
        error: null,
      },
    }));

    let fullResult = "";
    try {
      const { jobId } = await enqueueRecruitAssist("spellcheck", baseText, model || MODELS[0].id);
      await streamWriteAssist(jobId, (event) => {
        if (event.type === "chunk") {
          fullResult += event.text;
          setSpellchecks((prev) => {
            const current = prev[fieldKey];
            if (!current) return prev;
            return { ...prev, [fieldKey]: { ...current, rawResult: fullResult } };
          });
        } else if (event.type === "error") {
          setSpellchecks((prev) => {
            const current = prev[fieldKey];
            if (!current) return prev;
            return {
              ...prev,
              [fieldKey]: { ...current, loading: false, error: event.message || "맞춤법 검사 중 오류가 발생했습니다." },
            };
          });
        }
      });

      const correctedText = extractCorrectedSpellcheckText(fullResult, baseText);
      const changes = buildSpellcheckChanges(baseText, correctedText);
      setSpellchecks((prev) => {
        const current = prev[fieldKey];
        if (!current) return prev;
        return {
          ...prev,
          [fieldKey]: {
            ...current,
            loading: false,
            correctedText,
            rawResult: fullResult,
            changes,
            error: null,
          },
        };
      });
    } catch (error) {
      setSpellchecks((prev) => {
        const current = prev[fieldKey];
        if (!current) return prev;
        return {
          ...prev,
          [fieldKey]: {
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "맞춤법 검사 중 오류가 발생했습니다.",
          },
        };
      });
    }
  };

  const updateSpellcheckChange = (
    fieldKey: string,
    changeId: string,
    status: SpellcheckChangeStatus,
    onChange: (value: string) => void,
  ) => {
    const current = spellchecks[fieldKey];
    if (!current) return;
    const changes = current.changes.map((change) => (
      change.id === changeId ? { ...change, status } : change
    ));
    if (status === "accepted") onChange(applySpellcheckChanges(current.baseText, changes));
    setSpellchecks((prev) => {
      const latest = prev[fieldKey];
      if (!latest) return prev;
      return { ...prev, [fieldKey]: { ...latest, changes } };
    });
  };

  const applyAllSpellcheckChanges = (fieldKey: string, onChange: (value: string) => void) => {
    const current = spellchecks[fieldKey];
    if (!current) return;
    const changes = current.changes.map((change) => (
      change.status === "pending" ? { ...change, status: "accepted" as const } : change
    ));
    onChange(applySpellcheckChanges(current.baseText, changes));
    setSpellchecks((prev) => {
      const latest = prev[fieldKey];
      if (!latest) return prev;
      return { ...prev, [fieldKey]: { ...latest, changes } };
    });
  };

  const closeSpellcheck = (fieldKey: string) => {
    setSpellchecks((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  };

  const handleJdImageFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0 || jdImageLoading) return;

    setJdImageLoading(true);
    setJdImageError(null);
    try {
      const texts = (await Promise.all(imageFiles.map((f) => extractJdTextFromImage(f, jdOcrModel)))).filter(Boolean);
      if (texts.length === 0) {
        setJdImageError("이미지에서 추출된 텍스트가 없습니다.");
        return;
      }
      updateActiveTarget({
        jd: [activeTarget.jd.trim(), ...texts].filter(Boolean).join("\n\n"),
      });
    } catch (e) {
      setJdImageError(e instanceof Error ? e.message : "이미지 텍스트 추출에 실패했습니다.");
    } finally {
      setJdImageLoading(false);
      setJdDragOver(false);
    }
  };

  const normalExperienceIndexes = activeExperiences
    .map((exp, index) => (exp.activityType === "해외 경험" ? -1 : index))
    .filter((index) => index >= 0);
  const firstNormalExperienceIndex = normalExperienceIndexes[0] ?? -1;
  const lastNormalExperienceIndex = normalExperienceIndexes[normalExperienceIndexes.length - 1] ?? -1;
  const overseasExperienceIndexes = activeExperiences
    .map((exp, index) => (exp.activityType === "해외 경험" ? index : -1))
    .filter((index) => index >= 0);
  const firstOverseasExperienceIndex = overseasExperienceIndexes[0] ?? -1;
  const lastOverseasExperienceIndex = overseasExperienceIndexes[overseasExperienceIndexes.length - 1] ?? -1;
  const moveNormalExperienceAt = (index: number, direction: -1 | 1) => {
    const currentPosition = normalExperienceIndexes.indexOf(index);
    const targetIndex = normalExperienceIndexes[currentPosition + direction];
    if (targetIndex === undefined) return;
    const experiences = [...activeExperiences];
    [experiences[index], experiences[targetIndex]] = [experiences[targetIndex], experiences[index]];
    updateActiveTarget({ experiences });
  };
  const moveOverseasExperienceAt = (index: number, direction: -1 | 1) => {
    const currentPosition = overseasExperienceIndexes.indexOf(index);
    const targetIndex = overseasExperienceIndexes[currentPosition + direction];
    if (targetIndex === undefined) return;
    const experiences = [...activeExperiences];
    [experiences[index], experiences[targetIndex]] = [experiences[targetIndex], experiences[index]];
    updateActiveTarget({ experiences });
  };
  const buildProfileSectionEvaluationContent = (
    sectionLabel: string,
    fields: Array<[string, string | null | undefined]>,
    description: string,
  ) => {
    const isOverseas = sectionLabel === "해외 활동";
    const base = [
      !isOverseas && activeTarget.companyName ? `기업명: ${activeTarget.companyName}` : "",
      !isOverseas && activeTarget.jobTitle ? `직무: ${activeTarget.jobTitle}` : "",
      !isOverseas && activeTarget.jd ? `채용공고 JD:\n${activeTarget.jd}` : "",
      `평가 대상: ${sectionLabel}`,
      ...fields.map(([label, value]) => value?.trim() ? `${label}: ${value}` : ""),
      `작성 내용:\n${description}`,
    ];
    const request = isOverseas
      ? [
        "요청: 이 항목은 직무 적합도 점수 평가가 아니라 지원자를 소개하는 해외 경험 소재 평가입니다.",
        "기업/JD/직무와 억지로 연결하지 말고, 해외 경험 자체가 지원자를 어떤 사람으로 보여주는지 평가해주세요.",
        "먼저 기업 일반이 해외 활동 항목에서 확인하려는 이유를 추출해주세요. 예: 낯선 환경 적응력과 생존력, 열린 시각과 문화적 다양성, 주도성과 독립성, 글로벌 협업 감각, 언어/문화 장벽을 다루는 방식 등.",
        "그 다음 현재 작성 내용이 위 신호를 얼마나 보여주는지 평가해주세요.",
        "반드시 '추가 추천' 섹션을 만들어, 더 넣으면 좋은 개인 경험 소재를 제안해주세요. 예: 어떤 낯선 문제 상황, 문화 차이, 독립적으로 해결한 일, 현지인/국제 팀과의 소통, 실패 후 적응한 과정, 관점 변화.",
        "완성본 대필보다 작성자가 직접 보강할 수 있는 방향, 질문 목록, 강조 키워드 중심으로 답해주세요.",
      ].join(" ")
      : [
        "요청: 이 항목은 직무 적합도 점수 평가가 아니라 지원자를 소개하는 경험 소재 평가입니다.",
        "이 경험이 어떤 사람으로 보이게 하는지, 강점과 성향이 충분히 드러나는지, 빠진 맥락은 무엇인지 봐주세요.",
        "기업/JD/직무와 연결해 추가하면 좋은 내용, 강조하면 좋은 키워드, 보완 방향을 제안해주세요.",
        "완성본 대필보다 작성자가 직접 고칠 수 있는 방향 중심으로 답해주세요.",
      ].join(" ");
    return [...base, request].filter(Boolean).join("\n\n");
  };

  return (
    <div className="flex flex-col gap-0">
      {/* 기업별 지원 이력서 */}
      <section className="pb-6">
        <div className="flex items-center justify-between mb-4">
          {!hideTargetSelector && (
            <button onClick={addTarget}
              className="text-xs font-bold text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              기업 추가
            </button>
          )}
        </div>

        {!hideTargetSelector && (
          <div className="mb-5 flex gap-0 overflow-x-auto border-b border-slate-100">
            {targets.map((target, index) => (
              <button
                key={target.id}
                onClick={() => setActiveTargetId(target.id)}
                className={`shrink-0 border-b-2 -mb-px px-3 pb-3 pt-1 text-left transition-colors ${activeTarget.id === target.id
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
              >
                <span className="block text-2xs font-black tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span className="block max-w-36 truncate text-xs font-bold">{target.companyName || "새 기업"}</span>
                {target.jobTitle && <span className="block max-w-36 truncate text-2xs text-slate-400">{target.jobTitle}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="pt-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-6">
            <Field label="기업명" value={activeTarget.companyName} onChange={(v) => updateActiveTarget({ companyName: v })} placeholder="삼성전자 / 카카오" />
            <Field label="직무" value={activeTarget.jobTitle} onChange={(v) => updateActiveTarget({ jobTitle: v })} placeholder="SW 개발 / 데이터 분석" />
            <DateField label="지원일자" value={activeTarget.appliedAt ?? ""} onChange={(v) => updateActiveTarget({ appliedAt: v })} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="sm:col-span-1">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setJdDragOver(true);
                }}
                onDragLeave={() => setJdDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  handleJdImageFiles(event.dataTransfer.files);
                }}
                className={`rounded-md border p-3 transition-colors ${jdDragOver
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-slate-200 bg-slate-50"
                  }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">JD (채용공고)</span>
                  <div className="flex items-center gap-1.5">
                    <SpellcheckButton
                      onClick={() => runSpellcheck(`${activeTarget.id}-jd`, activeTarget.jd)}
                      disabled={!activeTarget.jd.trim() || spellchecks[`${activeTarget.id}-jd`]?.loading}
                    />
                    <select
                      value={jdOcrModel}
                      onChange={(e) => setJdOcrModel(e.target.value)}
                      className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none focus:border-indigo-500"
                      title="OCR 모델"
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700">
                      {jdImageLoading ? (
                        <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 10.5L4.8 7.7C5.15 7.35 5.72 7.35 6.07 7.7L7 8.63L8.93 6.7C9.28 6.35 9.85 6.35 10.2 6.7L11 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          <rect x="1.5" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                          <circle cx="4.4" cy="4.8" r="0.8" fill="currentColor" />
                        </svg>
                      )}
                      이미지에서 추출
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          if (event.target.files) handleJdImageFiles(event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
                <Field
                  label=""
                  value={activeTarget.jd}
                  onChange={(value) => updateActiveTarget({ jd: value })}
                  placeholder="지원할 채용공고 내용을 붙여넣거나, 채용공고 이미지를 이 영역에 끌어다 놓으세요."
                  rows={7}
                  multiline
                />
                <InlineSpellcheckPanel
                  state={spellchecks[`${activeTarget.id}-jd`]}
                  onAccept={(changeId) => updateSpellcheckChange(`${activeTarget.id}-jd`, changeId, "accepted", (value) => updateActiveTarget({ jd: value }))}
                  onReject={(changeId) => updateSpellcheckChange(`${activeTarget.id}-jd`, changeId, "rejected", (value) => updateActiveTarget({ jd: value }))}
                  onApplyAll={() => applyAllSpellcheckChanges(`${activeTarget.id}-jd`, (value) => updateActiveTarget({ jd: value }))}
                  onClose={() => closeSpellcheck(`${activeTarget.id}-jd`)}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">
                    이미지 파일을 끌어다 놓으면 JD 텍스트로 추출해서 아래 내용에 추가합니다.
                  </p>
                  {jdImageError && <p className="text-xs font-semibold text-red-500">{jdImageError}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 교육 이수사항 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>교육 이수사항</SectionTitle>
        {activeTrainings.length === 0 && <EmptyHint>교육 과정, 부트캠프, 직무 교육 등 이수사항을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-6">
          {activeTrainings.map((training, index) => (
            <div key={training.id} className="border border-transparent bg-white py-2">
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-base font-black text-slate-800">- 교육이수사항</span>
                <div className="flex items-center gap-4">
                  <TextEvaluateButton
                    onClick={() => onEvaluateText?.(
                      training.id,
                      `교육이수사항 ${index + 1} 글 평가`,
                      buildProfileSectionEvaluationContent("교육이수사항", [
                        ["교육명", training.title],
                        ["교육기관명", training.institution],
                        ["이수기간", [training.startDate, training.endDate].filter(Boolean).join(" ~ ")],
                        ["교육시간", training.hours ? `${training.hours}시간` : ""],
                      ], training.description ?? ""),
                    )}
                    disabled={!(training.description ?? "").trim()}
                  />
                  <SpellcheckButton
                    onClick={() => runSpellcheck(training.id, training.description ?? "")}
                    disabled={!(training.description ?? "").trim() || spellchecks[training.id]?.loading}
                  />
                  <IconBtn label="위로 이동" onClick={() => moveTrainingAt(index, -1)} disabled={index === 0}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 15V3M4.5 7.5L9 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </IconBtn>
                  <IconBtn label="아래로 이동" onClick={() => moveTrainingAt(index, 1)} disabled={index === activeTrainings.length - 1}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 3v12M4.5 10.5L9 15l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </IconBtn>
                  <IconBtn label="삭제" onClick={() => removeTrainingAt(index)}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M4 9h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </IconBtn>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                <InlineField label="교육명">
                  <ActivityInput
                    value={training.title}
                    onChange={(v) => updateTrainingAt(index, { title: v })}
                    placeholder="교육 과정명을 입력해주세요."
                  />
                </InlineField>
                <InlineField label="교육기관명">
                  <ActivityInput
                    value={training.institution}
                    onChange={(v) => updateTrainingAt(index, { institution: v })}
                    placeholder="교육 기관명을 입력해주세요."
                  />
                </InlineField>
                <InlineField label="이수기간">
                  <ActivityDateRange
                    startDate={training.startDate ?? ""}
                    endDate={training.endDate ?? ""}
                    onStartChange={(v) => updateTrainingAt(index, { startDate: v })}
                    onEndChange={(v) => updateTrainingAt(index, { endDate: v })}
                  />
                </InlineField>
                <InlineField label="교육시간">
                  <div className="relative">
                    <ActivityInput
                      value={training.hours ?? ""}
                      onChange={(v) => updateTrainingAt(index, { hours: v })}
                      placeholder="교육시간"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">시간</span>
                  </div>
                </InlineField>
                <BlockField label="교육과정">
                  <ActivityInput
                    value={training.description ?? ""}
                    onChange={(v) => updateTrainingAt(index, { description: v })}
                    placeholder="교육 과정 주요 내용을 상세히 입력해주세요."
                    rows={6}
                    multiline
                  />
                  <InlineSpellcheckPanel
                    state={spellchecks[training.id]}
                    onAccept={(changeId) => updateSpellcheckChange(training.id, changeId, "accepted", (value) => updateTrainingAt(index, { description: value }))}
                    onReject={(changeId) => updateSpellcheckChange(training.id, changeId, "rejected", (value) => updateTrainingAt(index, { description: value }))}
                    onApplyAll={() => applyAllSpellcheckChanges(training.id, (value) => updateTrainingAt(index, { description: value }))}
                    onClose={() => closeSpellcheck(training.id)}
                  />
                </BlockField>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addTraining}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            교육이수사항
          </button>
        </div>
      </section>

      {/* 학내외 활동 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>학내외 활동</SectionTitle>
        {activeExperiences.filter((exp) => exp.activityType !== "해외 경험").length === 0 && <EmptyHint>동아리, 연구회, 팀 프로젝트, 온라인 커뮤니티 등 학내외 활동을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-6">
          {activeExperiences.map((exp, index) => {
            if (exp.activityType === "해외 경험") return null;
            return (
              <div key={exp.id} className="border border-transparent bg-white py-2">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <span className="text-base font-black text-slate-800">- 학내외활동</span>
                  <div className="flex items-center gap-4">
                    <TextEvaluateButton
                      onClick={() => onEvaluateText?.(
                        exp.id,
                        `학내외활동 ${index + 1} 글 평가`,
                        buildProfileSectionEvaluationContent("학내외활동", [
                          ["활동구분", exp.activityType],
                          ["기관 및 조직명", exp.organizationName],
                          ["활동기간", [exp.startDate, exp.endDate].filter(Boolean).join(" ~ ")],
                          ["역할", exp.role],
                        ], exp.description ?? ""),
                      )}
                      disabled={!(exp.description ?? "").trim()}
                    />
                    <SpellcheckButton
                      onClick={() => runSpellcheck(exp.id, exp.description ?? "")}
                      disabled={!(exp.description ?? "").trim() || spellchecks[exp.id]?.loading}
                    />
                    <IconBtn label="위로 이동" onClick={() => moveNormalExperienceAt(index, -1)} disabled={index === firstNormalExperienceIndex}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 15V3M4.5 7.5L9 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </IconBtn>
                    <IconBtn label="아래로 이동" onClick={() => moveNormalExperienceAt(index, 1)} disabled={index === lastNormalExperienceIndex}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 3v12M4.5 10.5L9 15l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </IconBtn>
                    <IconBtn label="삭제" onClick={() => removeExperienceAt(index)}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M4 9h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </IconBtn>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                  <InlineField label="활동구분">
                    <ActivitySelect value={exp.activityType} onChange={(v) => updateExperienceAt(index, { activityType: v })} />
                  </InlineField>
                  <InlineField label="기관 및 조직명">
                    <ActivityInput
                      value={exp.organizationName}
                      onChange={(v) => updateExperienceAt(index, { organizationName: v })}
                      placeholder="기관 및 조직명을 입력해주세요."
                    />
                  </InlineField>
                  <InlineField label="활동기간">
                    <ActivityDateRange
                      startDate={exp.startDate ?? ""}
                      endDate={exp.endDate ?? ""}
                      onStartChange={(v) => updateExperienceAt(index, { startDate: v })}
                      onEndChange={(v) => updateExperienceAt(index, { endDate: v })}
                    />
                  </InlineField>
                  <InlineField label="역할">
                    <ActivityInput
                      value={exp.role ?? ""}
                      onChange={(v) => updateExperienceAt(index, { role: v })}
                      placeholder="직위 또는 역할을 입력해주세요."
                    />
                  </InlineField>
                  <BlockField label="상세 내용">
                    <div className="flex flex-col gap-2">
                      <ActivityTextarea
                        value={exp.description ?? ""}
                        onChange={(v) => updateExperienceAt(index, { description: v })}
                      />
                      <InlineSpellcheckPanel
                        state={spellchecks[exp.id]}
                        onAccept={(changeId) => updateSpellcheckChange(exp.id, changeId, "accepted", (value) => updateExperienceAt(index, { description: value }))}
                        onReject={(changeId) => updateSpellcheckChange(exp.id, changeId, "rejected", (value) => updateExperienceAt(index, { description: value }))}
                        onApplyAll={() => applyAllSpellcheckChanges(exp.id, (value) => updateExperienceAt(index, { description: value }))}
                        onClose={() => closeSpellcheck(exp.id)}
                      />
                      <span className="self-end text-xs font-semibold text-slate-400">
                        공백 포함 {(exp.description ?? "").length.toLocaleString()}자 · 공백 제외 {(exp.description ?? "").replace(/\s/g, "").length.toLocaleString()}자
                      </span>
                    </div>
                  </BlockField>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addExperience()}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            학내외활동
          </button>
        </div>
      </section>

      {/* 수상 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>수상</SectionTitle>
        {activePrizes.length === 0 && <EmptyHint>공모전, 대회, 장학, 표창 등 수상 내역을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-6">
          {activePrizes.map((prize, index) => (
            <div key={prize.id} className="border border-transparent bg-white py-2">
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-base font-black text-slate-800">- 수상</span>
                <div className="flex items-center gap-4">
                  <TextEvaluateButton
                    onClick={() => onEvaluateText?.(
                      prize.id,
                      `수상 ${index + 1} 글 평가`,
                      buildProfileSectionEvaluationContent("수상", [
                        ["상훈명", prize.title],
                        ["수여기관", prize.organization],
                        ["발급일", prize.issuedDate],
                      ], prize.description ?? ""),
                    )}
                    disabled={!(prize.description ?? "").trim()}
                  />
                  <SpellcheckButton
                    onClick={() => runSpellcheck(prize.id, prize.description ?? "")}
                    disabled={!(prize.description ?? "").trim() || spellchecks[prize.id]?.loading}
                  />
                  <IconBtn label="위로 이동" onClick={() => movePrizeAt(index, -1)} disabled={index === 0}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 15V3M4.5 7.5L9 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </IconBtn>
                  <IconBtn label="아래로 이동" onClick={() => movePrizeAt(index, 1)} disabled={index === activePrizes.length - 1}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 3v12M4.5 10.5L9 15l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </IconBtn>
                  <IconBtn label="삭제" onClick={() => removePrizeAt(index)}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M4 9h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </IconBtn>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                <InlineField label="상훈명">
                  <ActivityInput
                    value={prize.title}
                    onChange={(v) => updatePrizeAt(index, { title: v })}
                    placeholder="공모전 대상 / 우수상"
                  />
                </InlineField>
                <InlineField label="수여기관">
                  <ActivityInput
                    value={prize.organization}
                    onChange={(v) => updatePrizeAt(index, { organization: v })}
                    placeholder="수여기관을 입력해주세요."
                  />
                </InlineField>
                <InlineField label="발급일">
                  <ActivityDateInput
                    value={prize.issuedDate ?? ""}
                    onChange={(v) => updatePrizeAt(index, { issuedDate: v })}
                  />
                </InlineField>
                <BlockField label="상세 내용">
                  <div className="flex flex-col gap-2">
                    <ActivityInput
                      value={prize.description ?? ""}
                      onChange={(v) => updatePrizeAt(index, { description: v })}
                      placeholder="수상 배경, 기여도, 결과를 적어주세요."
                      rows={4}
                      multiline
                    />
                    <InlineSpellcheckPanel
                      state={spellchecks[prize.id]}
                      onAccept={(changeId) => updateSpellcheckChange(prize.id, changeId, "accepted", (value) => updatePrizeAt(index, { description: value }))}
                      onReject={(changeId) => updateSpellcheckChange(prize.id, changeId, "rejected", (value) => updatePrizeAt(index, { description: value }))}
                      onApplyAll={() => applyAllSpellcheckChanges(prize.id, (value) => updatePrizeAt(index, { description: value }))}
                      onClose={() => closeSpellcheck(prize.id)}
                    />
                    <span className="self-end text-xs font-semibold text-slate-400">
                      공백 포함 {(prize.description ?? "").length.toLocaleString()}자 · 공백 제외 {(prize.description ?? "").replace(/\s/g, "").length.toLocaleString()}자
                    </span>
                  </div>
                </BlockField>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addPrize}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            수상
          </button>
        </div>
      </section>

      {/* 해외 활동 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>해외 활동</SectionTitle>
        {activeExperiences.filter((exp) => exp.activityType === "해외 경험").length === 0 && <EmptyHint>해외연수, 교환학생, 글로벌 프로젝트 등 해외 활동을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-6">
          {activeExperiences.map((exp, index) => {
            if (exp.activityType !== "해외 경험") return null;
            return (
              <div key={exp.id} className="border border-transparent bg-white py-2">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <span className="text-base font-black text-slate-800">- 해외 활동</span>
                  <div className="flex items-center gap-4">
                    <TextEvaluateButton
                      onClick={() => onEvaluateText?.(
                        exp.id,
                        `해외 활동 ${index + 1} 글 평가`,
                        buildProfileSectionEvaluationContent("해외 활동", [
                          ["해외경험 목적", exp.role],
                          ["국가", exp.organizationName],
                          ["해외경험 기간", [exp.startDate, exp.endDate].filter(Boolean).join(" ~ ")],
                        ], exp.description ?? ""),
                      )}
                      disabled={!(exp.description ?? "").trim()}
                    />
                    <SpellcheckButton
                      onClick={() => runSpellcheck(exp.id, exp.description ?? "")}
                      disabled={!(exp.description ?? "").trim() || spellchecks[exp.id]?.loading}
                    />
                    <IconBtn label="위로 이동" onClick={() => moveOverseasExperienceAt(index, -1)} disabled={index === firstOverseasExperienceIndex}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 15V3M4.5 7.5L9 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </IconBtn>
                    <IconBtn label="아래로 이동" onClick={() => moveOverseasExperienceAt(index, 1)} disabled={index === lastOverseasExperienceIndex}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 3v12M4.5 10.5L9 15l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </IconBtn>
                    <IconBtn label="삭제" onClick={() => removeExperienceAt(index)}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M4 9h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </IconBtn>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                  <InlineField label="해외경험 목적">
                    <OverseasPurposeSelect
                      value={exp.role ?? ""}
                      onChange={(v) => updateExperienceAt(index, { role: v })}
                    />
                  </InlineField>
                  <InlineField label="국가선택">
                    <CountrySelect
                      value={exp.organizationName}
                      onChange={(v) => updateExperienceAt(index, { organizationName: v })}
                    />
                  </InlineField>
                  <InlineField label="해외경험 기간">
                    <ActivityDateRange
                      startDate={exp.startDate ?? ""}
                      endDate={exp.endDate ?? ""}
                      onStartChange={(v) => updateExperienceAt(index, { startDate: v })}
                      onEndChange={(v) => updateExperienceAt(index, { endDate: v })}
                    />
                  </InlineField>
                  <BlockField label="상세 내용">
                    <ActivityInput
                      value={exp.description ?? ""}
                      onChange={(v) => updateExperienceAt(index, { description: v })}
                      placeholder="국가, 수행 내용, 배운 점, 성과를 적어주세요."
                      rows={4}
                      multiline
                    />
                    <InlineSpellcheckPanel
                      state={spellchecks[exp.id]}
                      onAccept={(changeId) => updateSpellcheckChange(exp.id, changeId, "accepted", (value) => updateExperienceAt(index, { description: value }))}
                      onReject={(changeId) => updateSpellcheckChange(exp.id, changeId, "rejected", (value) => updateExperienceAt(index, { description: value }))}
                      onApplyAll={() => applyAllSpellcheckChanges(exp.id, (value) => updateExperienceAt(index, { description: value }))}
                      onClose={() => closeSpellcheck(exp.id)}
                    />
                  </BlockField>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addExperience("해외 경험")}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            해외 활동
          </button>
        </div>
      </section>

      {/* 자기소개서 */}
      <section className="border-t border-slate-200 pt-6 pb-2">
        <SectionTitle>자기소개서</SectionTitle>
        {activeTarget.selfIntroductions.length === 0 && <EmptyHint>현재 기업의 자기소개서 문항을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-6">
          {activeTarget.selfIntroductions.map((si, i) => (
            <div key={si.id} className="bg-slate-50/80 border border-slate-200 rounded-md p-5 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800">문항 {i + 1}</span>
                  {si.category && si.category.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {si.category.map((category) => (
                        <span key={category} className="inline-flex items-center rounded-sm bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onGuide?.(si, i)}
                    disabled={!si.question.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                      <path d="M6 1.2l.9 2.8 2.9.1-2.3 1.7.8 2.9L6 7 3.7 8.7l.8-2.9-2.3-1.7 2.9-.1L6 1.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                    작성 방향
                  </button>
                  <DeleteBtn onClick={() => updateActiveTarget({ selfIntroductions: activeTarget.selfIntroductions.filter((_, j) => j !== i) })} />
                </div>
              </div>
              <Field label="질문" value={si.question} onChange={(v) => {
                const ss = [...activeTarget.selfIntroductions];
                ss[i] = { ...ss[i], question: v };
                updateActiveTarget({ selfIntroductions: ss });
              }} placeholder="성장과정 및 인생에서 가장 가치를 두는 것은?" multiline rows={1} />
              <Field label="답변 (학내외 활동 라이브러리에 저장됩니다)" value={si.answer} onChange={(v) => {
                const ss = [...activeTarget.selfIntroductions];
                ss[i] = { ...ss[i], answer: v };
                updateActiveTarget({ selfIntroductions: ss });
              }} placeholder="자세한 내용을 작성하세요." multiline rows={8} />
              <InlineSpellcheckPanel
                state={spellchecks[si.id]}
                onAccept={(changeId) => updateSpellcheckChange(si.id, changeId, "accepted", (value) => {
                  const ss = [...activeTarget.selfIntroductions];
                  ss[i] = { ...ss[i], answer: value };
                  updateActiveTarget({ selfIntroductions: ss });
                })}
                onReject={(changeId) => updateSpellcheckChange(si.id, changeId, "rejected", (value) => {
                  const ss = [...activeTarget.selfIntroductions];
                  ss[i] = { ...ss[i], answer: value };
                  updateActiveTarget({ selfIntroductions: ss });
                })}
                onApplyAll={() => applyAllSpellcheckChanges(si.id, (value) => {
                  const ss = [...activeTarget.selfIntroductions];
                  ss[i] = { ...ss[i], answer: value };
                  updateActiveTarget({ selfIntroductions: ss });
                })}
                onClose={() => closeSpellcheck(si.id)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-1">
                <span className="text-xs font-semibold text-slate-400">
                  공백 포함 {si.answer.length.toLocaleString()}자 · 공백 제외 {si.answer.replace(/\s/g, "").length.toLocaleString()}자
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runSpellcheck(si.id, si.answer)}
                    disabled={!si.answer.trim() || spellchecks[si.id]?.loading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    맞춤법
                  </button>
                  <button
                    onClick={() => onEvaluate?.(si, i)}
                    disabled={!si.answer.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-4 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <IconEvaluate />
                    글 평가
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addSelfIntro}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            자기소개서
          </button>
        </div>
      </section>
    </div>
  );
}
