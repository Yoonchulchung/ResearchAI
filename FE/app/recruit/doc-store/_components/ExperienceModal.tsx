"use client";

import { useState } from "react";
import type { Experience } from "@/lib/api/experiences";
import { CATEGORIES } from "../_constants";
import { IconCheck, IconX } from "./icons";

interface Props {
  initial?: Experience;
  onSave: (data: { title: string; content: string; category?: string }) => Promise<void>;
  onClose: () => void;
}

export function ExperienceModal({ initial, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content: content.trim(), category: category || undefined });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-slate-200 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">
            {initial ? "경험 수정" : "새 경험 추가"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <IconX />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 스타트업 백엔드 개발 인턴 (6개월)"
              className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 placeholder-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">카테고리</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c === category ? "" : c)}
                  className={`px-3 py-1 rounded-sm text-xs font-medium border transition-all ${
                    category === c
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              경험 내용
              <span className="ml-2 font-normal text-slate-400">구체적으로 작성할수록 AI가 정확하게 매칭합니다</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`예:\n- Node.js, NestJS를 사용한 REST API 설계 및 구현\n- PostgreSQL 스키마 설계, 쿼리 최적화 (응답시간 30% 개선)\n- Docker 기반 배포 자동화 파이프라인 구축\n- 코드 리뷰 문화 도입 및 기술 블로그 운영`}
              rows={10}
              className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 resize-none placeholder-slate-300 leading-relaxed"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !content.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <IconCheck />
            )}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
