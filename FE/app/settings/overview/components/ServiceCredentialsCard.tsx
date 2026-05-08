"use client";

import { useState } from "react";
import { updateApiKeyApi } from "@/lib/api/auth";

// ── 단일 키 행 (DART API 키 등) ──────────────────────────────────────

interface ApiKeyRow {
  kind: "api-key";
  service: string;
  keyName: string;
  keyValue: string | null;
  description: string;
  placeholder: string;
}

// ── ID + 비밀번호 행 (잡플래닛, 잡코리아) ───────────────────────────

interface IdPwRow {
  kind: "id-password";
  service: string;
  idKey: string;
  pwKey: string;
  idLabel: string;
  idValue: string | null;
  pwValue: string | null;
  description: string;
}

type ServiceRow = ApiKeyRow | IdPwRow;

// ── 공통 저장 버튼 ───────────────────────────────────────────────────

function InlineEdit({
  value,
  type = "text",
  placeholder,
  onSave,
  onCancel,
  saving,
}: {
  value: string;
  type?: "text" | "password";
  placeholder: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [input, setInput] = useState(value);
  return (
    <>
      <input
        type={type}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) onSave(input.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        autoFocus
        className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white text-slate-700"
      />
      <button
        onClick={() => input.trim() && onSave(input.trim())}
        disabled={saving || !input.trim()}
        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "저장 중..." : "저장"}
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors"
      >
        취소
      </button>
    </>
  );
}

// ── DART (API 키 단일 행) ────────────────────────────────────────────

function ApiKeyRowComp({ row, onUpdated }: { row: ApiKeyRow; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (v: string) => {
    setSaving(true);
    setError("");
    try {
      await updateApiKeyApi(row.keyName, v);
      setEditing(false);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const masked = row.keyValue
    ? `${row.keyValue.slice(0, 6)}${"•".repeat(Math.max(0, row.keyValue.length - 6))}`
    : null;

  return (
    <div className="border-b border-slate-100 last:border-0 px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="w-28 shrink-0">
          <p className="text-sm font-semibold text-slate-700">{row.service}</p>
          <span className={`inline-flex items-center gap-1 text-xs mt-0.5 font-medium ${row.keyValue ? "text-emerald-600" : "text-slate-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${row.keyValue ? "bg-emerald-500" : "bg-slate-300"}`} />
            {row.keyValue ? "설정됨" : "미설정"}
          </span>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <span className="w-16 text-xs text-slate-500 shrink-0">API Key</span>
          {editing ? (
            <InlineEdit
              value=""
              type="text"
              placeholder={row.placeholder}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
              saving={saving}
            />
          ) : (
            <>
              <span className={`flex-1 text-xs font-mono ${masked ? "text-slate-600" : "text-slate-300"}`}>
                {masked ?? "미설정"}
              </span>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
              >
                수정
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      <p className="text-xs text-slate-400 mt-2">{row.description}</p>
    </div>
  );
}

// ── 잡플래닛/잡코리아 (ID + 비밀번호 쌍) ────────────────────────────

function IdPwRowComp({ row, onUpdated }: { row: IdPwRow; onUpdated: () => void }) {
  const [editingId, setEditingId] = useState(false);
  const [editingPw, setEditingPw] = useState(false);
  const [savingId, setSavingId] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [error, setError] = useState("");

  const save = async (key: string, value: string, setSaving: (v: boolean) => void, onDone: () => void) => {
    setSaving(true);
    setError("");
    try {
      await updateApiKeyApi(key, value);
      onDone();
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = !!(row.idValue && row.pwValue);
  const isPartial = !!(row.idValue || row.pwValue) && !isConfigured;

  return (
    <div className="border-b border-slate-100 last:border-0 px-6 py-4">
      <div className="flex items-start gap-4">
        <div className="w-28 shrink-0 pt-1">
          <p className="text-sm font-semibold text-slate-700">{row.service}</p>
          <span className={`inline-flex items-center gap-1 text-xs mt-0.5 font-medium ${isConfigured ? "text-emerald-600" : isPartial ? "text-amber-500" : "text-slate-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? "bg-emerald-500" : isPartial ? "bg-amber-400" : "bg-slate-300"}`} />
            {isConfigured ? "설정됨" : isPartial ? "일부 설정" : "미설정"}
          </span>
        </div>

        <div className="flex-1 space-y-2">
          {/* ID */}
          <div className="flex items-center gap-2">
            <span className="w-16 text-xs text-slate-500 shrink-0">{row.idLabel}</span>
            {editingId ? (
              <InlineEdit
                value=""
                type="text"
                placeholder={`${row.idLabel} 입력...`}
                onSave={(v) => save(row.idKey, v, setSavingId, () => setEditingId(false))}
                onCancel={() => setEditingId(false)}
                saving={savingId}
              />
            ) : (
              <>
                <span className={`flex-1 text-xs font-mono ${row.idValue ? "text-slate-600" : "text-slate-300"}`}>
                  {row.idValue
                    ? `${row.idValue.slice(0, 3)}${"•".repeat(Math.max(0, row.idValue.length - 3))}`
                    : "미설정"}
                </span>
                <button onClick={() => setEditingId(true)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors">수정</button>
              </>
            )}
          </div>

          {/* 비밀번호 */}
          <div className="flex items-center gap-2">
            <span className="w-16 text-xs text-slate-500 shrink-0">비밀번호</span>
            {editingPw ? (
              <InlineEdit
                value=""
                type="password"
                placeholder="비밀번호 입력..."
                onSave={(v) => save(row.pwKey, v, setSavingPw, () => setEditingPw(false))}
                onCancel={() => setEditingPw(false)}
                saving={savingPw}
              />
            ) : (
              <>
                <span className={`flex-1 text-xs font-mono ${row.pwValue ? "text-slate-600" : "text-slate-300"}`}>
                  {row.pwValue ? "••••••••" : "미설정"}
                </span>
                <button onClick={() => setEditingPw(true)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors">수정</button>
              </>
            )}
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">{row.description}</p>
    </div>
  );
}

// ── 카드 ─────────────────────────────────────────────────────────────

export function ServiceCredentialsCard({
  loading,
  dartApiKey,
  jobplanetId,
  jobplanetPassword,
  jobkoreaId,
  jobkoreaPassword,
  onRefresh,
}: {
  loading: boolean;
  dartApiKey: string | null;
  jobplanetId: string | null;
  jobplanetPassword: string | null;
  jobkoreaId: string | null;
  jobkoreaPassword: string | null;
  onRefresh: () => void;
}) {
  const rows: ServiceRow[] = [
    {
      kind: "api-key",
      service: "DART",
      keyName: "DART_API_KEY",
      keyValue: dartApiKey,
      placeholder: "OpenDART API 키 입력 (opendart.fss.or.kr 발급)",
      description: "금융감독원 전자공시 OpenAPI — 기업 재무제표·공시 데이터 수집. opendart.fss.or.kr에서 무료 발급",
    },
    {
      kind: "id-password",
      service: "잡플래닛",
      idKey: "JOBPLANET_ID",
      pwKey: "JOBPLANET_PASSWORD",
      idLabel: "이메일",
      idValue: jobplanetId,
      pwValue: jobplanetPassword,
      description: "기업 리뷰 (복지·조직문화·워라밸) 수집 — 기업 분석 품질 향상에 사용",
    },
    {
      kind: "id-password",
      service: "잡코리아",
      idKey: "JOBKOREA_ID",
      pwKey: "JOBKOREA_PASSWORD",
      idLabel: "아이디",
      idValue: jobkoreaId,
      pwValue: jobkoreaPassword,
      description: "기업 채용 공고 및 기업 정보 수집에 사용",
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-800">서비스 계정</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          기업 분석 품질 향상을 위한 외부 서비스 인증 정보 — 기업 분석 시 자동으로 활용됩니다
        </p>
      </div>
      {loading ? (
        <div className="px-6 py-6 text-center text-slate-400 text-sm">로딩 중...</div>
      ) : (
        rows.map((row) =>
          row.kind === "api-key"
            ? <ApiKeyRowComp key={row.service} row={row} onUpdated={onRefresh} />
            : <IdPwRowComp key={row.service} row={row} onUpdated={onRefresh} />
        )
      )}
    </div>
  );
}
