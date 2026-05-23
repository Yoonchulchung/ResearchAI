"use client";

import { useState } from "react";
import { createExperience } from "@/lib/api/experiences";

interface ExtractedItem {
  title: string;
  content: string;
}

interface Props {
  docId: string;
  docTitle: string;
  items: ExtractedItem[];
  onClose: () => void;
  onSaved: () => void;
}

export function ExtractExpModal({ docId, docTitle, items, onClose, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(items.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleSave = async () => {
    const toSave = items.filter((_, i) => selected.has(i));
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(toSave.map((item) => createExperience({ title: item.title, content: item.content, sourceDocId: docId })));
      setDone(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">경험 추출</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{docTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">추출된 경험이 없습니다.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3">
                저장할 경험을 선택하세요. ({selected.size}/{items.length}개 선택됨)
              </p>
              {items.map((item, i) => (
                <label
                  key={i}
                  className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selected.has(i)
                      ? "border-indigo-300 bg-indigo-50/60"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="mt-0.5 accent-indigo-600 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 mb-1">{item.title}</p>
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                      {item.content}
                    </p>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <button
            onClick={() =>
              setSelected(
                selected.size === items.length
                  ? new Set()
                  : new Set(items.map((_, i) => i)),
              )
            }
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {selected.size === items.length ? "전체 해제" : "전체 선택"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={selected.size === 0 || saving || done}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                done
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {saving ? (
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : done ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
              {done ? "저장됨" : `${selected.size}개 경험으로 저장`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
