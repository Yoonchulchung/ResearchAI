"use client";

import { useCallback, useEffect, useState } from "react";
import { getRunningOllamaModels, unloadOllamaModel, OllamaRunningModel } from "@/lib/api/ai";

function formatVram(bytes: number): string {
  if (bytes === 0) return "–";
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

export default function SystemPage() {
  const [models, setModels] = useState<OllamaRunningModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [unloading, setUnloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      const data = await getRunningOllamaModels();
      setModels(data);
      setError(null);
    } catch {
      setError("Ollama에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleUnload = async (name: string) => {
    setUnloading(name);
    try {
      await unloadOllamaModel(name);
      await fetchModels();
    } catch {
      setError(`${name} 언로드 실패`);
    } finally {
      setUnloading(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-slate-800">시스템</h1>
        <p className="text-xs text-slate-400 mt-0.5">현재 메모리에 로드된 Ollama 모델을 관리합니다.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            로드된 모델 {!loading && `(${models.length})`}
          </span>
          <button
            onClick={fetchModels}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">불러오는 중...</div>
        ) : error ? (
          <div className="px-5 py-8 text-center text-xs text-red-400">{error}</div>
        ) : models.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">
            현재 메모리에 로드된 모델이 없습니다.
          </div>
        ) : (
          <ul>
            {models.map((m) => (
              <li
                key={m.name}
                className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-slate-800">{m.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">VRAM {formatVram(m.size_vram)}</div>
                </div>
                <button
                  onClick={() => handleUnload(m.name)}
                  disabled={unloading === m.name}
                  className="text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unloading === m.name ? "언로드 중..." : "메모리 해제"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
