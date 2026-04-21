"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginRequired } from "@/components/LoginRequired";
import {
  getRunningOllamaModels, unloadOllamaModel, getSystemMemory, getLlamaCppModels,
  OllamaRunningModel, SystemMemory,
} from "@/lib/api/ai";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "–";
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function MemoryBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct >= 85 ? "bg-red-400" : pct >= 60 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium text-slate-700">{formatBytes(used)} / {formatBytes(total)} <span className="text-slate-400">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SystemPage() {
  const { user } = useAuth();
  const [models, setModels] = useState<OllamaRunningModel[]>([]);
  const [llamaModels, setLlamaModels] = useState<{ name: string }[]>([]);
  const [memory, setMemory] = useState<SystemMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [unloading, setUnloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [modelData, memData, llamaData] = await Promise.all([
        getRunningOllamaModels(),
        getSystemMemory(),
        getLlamaCppModels().catch(() => []),
      ]);
      setModels(modelData);
      setMemory(memData);
      setLlamaModels(llamaData);
      setError(null);
    } catch {
      setError("데이터를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUnload = async (name: string) => {
    setUnloading(name);
    try {
      await unloadOllamaModel(name);
      await fetchData();
    } catch {
      setError(`${name} 언로드 실패`);
    } finally {
      setUnloading(null);
    }
  };

  const modelRamTotal = models.reduce((sum, m) => sum + (m.size ?? 0), 0);
  const modelVramTotal = models.reduce((sum, m) => sum + (m.size_vram ?? 0), 0);

  if (!user) return <LoginRequired />;

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">시스템</h1>
        <p className="text-xs text-slate-400 mt-0.5">메모리 현황 및 로드된 Ollama 모델을 관리합니다.</p>
      </div>

      {/* 시스템 메모리 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">시스템 메모리</span>
        {loading ? (
          <div className="text-xs text-slate-400">불러오는 중...</div>
        ) : memory ? (
          <>
            <MemoryBar used={memory.used} total={memory.total} label="실제 사용 (wired + active + compressed)" />
            {memory.cached > 0 && (
              <MemoryBar used={memory.cached} total={memory.total} label="파일 캐시 (inactive)" />
            )}
            {modelRamTotal > 0 && (
              <MemoryBar used={modelRamTotal} total={memory.total} label="모델 RAM 점유" />
            )}
            {modelVramTotal > 0 && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-500">모델 VRAM 점유</span>
                <span className="font-medium text-slate-700">{formatBytes(modelVramTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-400">여유 메모리</span>
              <span className="text-slate-500">{formatBytes(memory.free)}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* llama.cpp 모델 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            llama.cpp 모델 {!loading && `(${llamaModels.length})`}
          </span>
          <button onClick={fetchData} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">새로고침</button>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">불러오는 중...</div>
        ) : llamaModels.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">
            llama.cpp 서버에 로드된 모델이 없습니다.<br />
            <span className="text-slate-300">LLAMA_CPP_BASE_URL (기본: http://localhost:8080)</span>
          </div>
        ) : (
          <ul>
            {llamaModels.map((m) => (
              <li key={m.name} className="flex items-center px-5 py-3.5 border-b border-slate-50 last:border-0">
                <div className="text-sm font-medium text-slate-800">{m.name}</div>
                <span className="ml-2 text-xs text-slate-400">llama.cpp</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 로드된 모델 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            로드된 모델 {!loading && `(${models.length})`}
          </span>
          <button
            onClick={fetchData}
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
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    {m.size > 0 && <span>RAM {formatBytes(m.size)}</span>}
                    {m.size_vram > 0 && <span>VRAM {formatBytes(m.size_vram)}</span>}
                  </div>
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
