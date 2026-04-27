"use client";

import { useState, useRef } from "react";
import { API_BASE } from "@/lib/api/base";
import { useTheme } from "@/contexts/ThemeContext";

interface ParseResult {
  fileId: string;
  filename: string;
  type: string;
  size: number;
  pageCount?: number;
  text?: string;
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-md ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
      <span className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{value}</span>
      <span className={`text-2xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

export function DocParsePanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState("");
  const [previewLines, setPreviewLines] = useState(50);

  const parse = async (file: File) => {
    setLoading(true);
    setError("");
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/media/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "파싱 실패");
      }
      const data = await res.json();
      setResult({ ...data, filename: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "파싱 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
    if (!allowed.includes(file.type)) {
      setError("PDF 또는 DOCX 파일만 지원합니다");
      return;
    }
    parse(file);
  };

  const baseCardCls = `rounded-lg shadow-sm border p-5 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`;
  const inputCls = `w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? "bg-white/5 border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`;

  return (
    <div className="space-y-5">
      {/* 업로드 영역 */}
      <div
        className={`${baseCardCls} transition-colors ${dragging ? "border-slate-300 bg-slate-50 text-slate-800/40" : ""}`}
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); dragCounter.current = 0; setDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={(e) => handleFiles(e.target.files)} />

        <div
          className="flex flex-col items-center justify-center py-8 cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          <div className={`w-12 h-12 rounded-lg shadow-sm flex items-center justify-center mb-3 ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
            {loading
              ? <span className="animate-spin text-indigo-500 text-xl">◌</span>
              : <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 3v10M7 9l4 4 4-4M3 17h16" stroke={isDark ? "#a5b4fc" : "#6366f1"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            }
          </div>
          <p className={`text-sm font-medium ${isDark ? "text-white/80" : "text-slate-700"}`}>
            {loading ? "파싱 중..." : "PDF / DOCX 파일을 드롭하거나 클릭해서 업로드"}
          </p>
          <p className={`text-xs mt-1 ${isDark ? "text-white/30" : "text-slate-400"}`}>파싱된 텍스트와 메타데이터를 확인합니다</p>
        </div>

        {error && <p className="text-center text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* 결과 */}
      {result && (
        <>
          {/* 메타 정보 */}
          <div className={baseCardCls}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${result.type === "pdf" ? "bg-red-500" : "bg-blue-500"}`}>
                {result.type.toUpperCase()}
              </span>
              <div>
                <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>{result.filename}</p>
                <p className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{(result.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              {result.pageCount != null && (
                <StatBadge label="페이지" value={result.pageCount} />
              )}
              <StatBadge label="추출 글자" value={(result.text?.length ?? 0).toLocaleString()} />
              <StatBadge label="추출 줄" value={(result.text?.split("\n").length ?? 0).toLocaleString()} />
              <div className={`flex flex-col items-center px-4 py-2 rounded-md ${
                !result.text || result.text.trim().length === 0
                  ? "bg-red-50"
                  : result.text.length < 500
                  ? "bg-yellow-50"
                  : "bg-green-50"
              }`}>
                <span className={`text-lg font-bold ${
                  !result.text || result.text.trim().length === 0 ? "text-red-600"
                  : result.text.length < 500 ? "text-yellow-600"
                  : "text-green-600"
                }`}>
                  {!result.text || result.text.trim().length === 0 ? "실패" : result.text.length < 500 ? "부분" : "성공"}
                </span>
                <span className="text-2xs text-slate-400">파싱 품질</span>
              </div>
            </div>
          </div>

          {/* 추출 텍스트 미리보기 */}
          {result.text && result.text.trim().length > 0 ? (
            <div className={baseCardCls}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-700"}`}>추출된 텍스트</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>미리보기 줄 수</span>
                  <select
                    value={previewLines}
                    onChange={(e) => setPreviewLines(Number(e.target.value))}
                    className={`text-xs rounded-lg border px-2 py-1 focus:outline-none ${isDark ? "bg-white/5 border-white/10 text-white" : "bg-white border-slate-200 text-slate-600"}`}
                  >
                    {[20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}줄</option>)}
                  </select>
                </div>
              </div>
              <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-mono rounded-md p-4 max-h-[480px] overflow-y-auto ${isDark ? "bg-black/20 text-white/70" : "bg-slate-50 text-slate-700"}`}>
                {result.text.split("\n").slice(0, previewLines).join("\n")}
                {result.text.split("\n").length > previewLines && (
                  `\n\n... (${(result.text.split("\n").length - previewLines).toLocaleString()}줄 더 있음)`
                )}
              </pre>
            </div>
          ) : (
            <div className={`${baseCardCls} text-center py-6`}>
              <p className={`text-sm font-medium text-red-500`}>텍스트 추출 실패</p>
              <p className={`text-xs mt-1 ${isDark ? "text-white/30" : "text-slate-400"}`}>
                스캔된 이미지 PDF이거나 텍스트 레이어가 없는 파일일 수 있습니다
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
