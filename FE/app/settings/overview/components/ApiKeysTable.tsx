"use client";

import { useState } from "react";
import { updateApiKey, type ApiKeyEntry } from "@/lib/api";
import { StatusBadge } from "./StatusBadge";

function KeyRow({
  entry,
  onUpdated,
}: {
  entry: ApiKeyEntry;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!inputValue.trim()) return;
    setSaving(true);
    setError("");
    try {
      await updateApiKey(entry.key, inputValue.trim());
      setEditing(false);
      setInputValue("");
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setInputValue("");
    setError("");
  };

  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
      <td className="px-6 py-4 text-slate-700 font-medium whitespace-nowrap">{entry.label}</td>
      <td className="px-4 py-4 font-mono text-slate-500 text-xs">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
              placeholder="새 API Key 입력..."
              autoFocus
              className="flex-1 min-w-0 px-3 py-1.5 text-xs font-mono border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white text-slate-700"
            />
            <button
              onClick={handleSave}
              disabled={saving || !inputValue.trim()}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className={entry.masked ? "text-slate-600" : "text-slate-300"}>
              {entry.masked ?? "미설정"}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
            >
              수정
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-red-500 text-[11px]">{error}</p>}
      </td>
      <td className="px-4 py-4">
        <StatusBadge active={entry.configured} />
      </td>
    </tr>
  );
}

export function ApiKeysTable({
  loading,
  apiKeys,
  onRefresh,
}: {
  loading: boolean;
  apiKeys: ApiKeyEntry[];
  onRefresh: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-800">API Keys</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            {["Service", "Key", "Status"].map((h) => (
              <th
                key={h}
                className="text-left px-6 py-3 text-[11px] font-semibold tracking-widest text-slate-400 uppercase first:px-6 [&:not(:first-child)]:px-4"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3} className="px-6 py-6 text-center text-slate-400 text-sm">
                로딩 중...
              </td>
            </tr>
          ) : (
            apiKeys.map((entry) => (
              <KeyRow key={entry.key} entry={entry} onUpdated={onRefresh} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
