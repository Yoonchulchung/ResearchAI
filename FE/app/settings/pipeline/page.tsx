"use client";

import { useState, useEffect, useRef } from "react";
import { getModels } from "@/lib/api";
import { ModelDefinition } from "@/types";
import { PromptTestPanel } from "@/settings/pipeline/PromptTestPanel/PromptTestPanel";
import { PipelineDiagram } from "@/settings/pipeline/PipelineDiagram/PipelineDiagram";
import { RecruitTestPanel } from "@/settings/pipeline/RecruitTestPanel/RecruitTestPanel";
import { RagDebugPanel } from "@/settings/pipeline/RagDebugPanel/RagDebugPanel";
import { DocParsePanel } from "@/settings/pipeline/DocParsePanel/DocParsePanel";
import { AiCallLogPanel } from "@/settings/pipeline/AiCallLogPanel/AiCallLogPanel";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, readSSE, tokenStore } from "@/lib/api/base";

type Tab = "pipeline" | "api" | "local" | "recruit" | "rag" | "docparse" | "calllog" | "jobplanet" | "catch";

interface JobplanetTestResult {
  ok: boolean;
  error?: string;
  failedStep?: string;
  finalUrl?: string;
  loginOnly?: boolean;
  companyName?: string;
  overallRating?: number;
  reviewCount?: number;
  welfare?: string;
  preview?: { rating: number; title: string; pros: string; cons: string; date: string }[];
  logs?: string[];
}

type JobplanetTestEvent =
  | { type: "log"; message: string }
  | { type: "done"; result: JobplanetTestResult }
  | { type: "error"; message: string };

interface CatchTestResult {
  ok: boolean;
  error?: string;
  failedStep?: string;
  finalUrl?: string;
  sessionReused?: boolean;
  logs?: string[];
}

type CatchTestEvent =
  | { type: "log"; message: string }
  | { type: "done"; result: CatchTestResult }
  | { type: "error"; message: string };

function JobplanetTestPanel({ isDark, user }: { isDark: boolean; user: ReturnType<typeof useAuth>["user"] }) {
  const [jpId, setJpId] = useState(user?.jobplanetId ?? "");
  const [jpPw, setJpPw] = useState(user?.jobplanetPassword ?? "");
  const [company, setCompany] = useState("삼성전자");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobplanetTestResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addClientLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  const handleTest = async () => {
    if (!jpId || !jpPw) return;
    setLoading(true);
    setResult(null);
    setLogs([]);
    addClientLog("FE 요청 준비 완료");
    try {
      const token = tokenStore.get();
      addClientLog("BE 잡플래닛 테스트 스트림 호출");
      const res = await fetch(`${API_BASE}/jobplanet/test-login/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: jpId, password: jpPw, companyName: company }),
      });
      addClientLog(`BE 스트림 연결: HTTP ${res.status}`);
      if (!res.ok || !res.body) throw new Error(`스트림 연결 실패 (${res.status})`);

      await readSSE<JobplanetTestEvent>(res, (event) => {
        if (event.type === "log") {
          setLogs((prev) => [...prev, event.message]);
          return;
        }
        if (event.type === "error") {
          const line = `[${new Date().toISOString()}] ${event.message}`;
          setLogs((prev) => [...prev, line]);
          setResult({ ok: false, error: event.message, logs: [line] });
          return true;
        }
        setResult(event.result);
        if (event.result.logs?.length) setLogs(event.result.logs);
        return true;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "네트워크 오류";
      const errorLog = `[${new Date().toISOString()}] 요청 실패: ${message}`;
      setLogs((prev) => [...prev, errorLog]);
      setResult({ ok: false, error: message, logs: [errorLog] });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${isDark ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-slate-500" : "bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-slate-300"}`;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-5 space-y-4 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>잡플래닛 ID (이메일)</label>
            <input value={jpId} onChange={(e) => setJpId(e.target.value)} placeholder="example@email.com" className={inputCls} />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>비밀번호</label>
            <input type="password" value={jpPw} onChange={(e) => setJpPw(e.target.value)} placeholder="••••••••" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>테스트 기업명</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="삼성전자" className={inputCls} />
        </div>
        <button
          onClick={handleTest}
          disabled={loading || !jpId || !jpPw}
          className="w-full py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "로그인 및 수집 중... (30~60초 소요)" : "테스트 실행"}
        </button>
        {loading && (
          <p className={`text-xs text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            Puppeteer로 잡플래닛에 로그인 후 기업 리뷰를 수집합니다. 잠시 기다려 주세요.
          </p>
        )}
      </div>

      <div className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-950 border-slate-700" : "bg-slate-950 border-slate-200"}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <div>
            <p className="text-xs font-semibold text-slate-200">잡플래닛 테스트 로그</p>
            <p className="text-[11px] text-slate-500">로그인, 검색, 리뷰 페이지 이동, 데이터 추출 단계를 표시합니다.</p>
          </div>
          <button
            onClick={() => setLogs([])}
            disabled={loading || logs.length === 0}
            className="px-2 py-1 text-[11px] font-semibold rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            지우기
          </button>
        </div>
        <div className="h-56 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-slate-500">테스트를 실행하면 단계별 로그가 여기에 표시됩니다.</p>
          ) : (
            <div className="space-y-1">
              {logs.map((line, index) => (
                <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-slate-300">
                  <span className="text-slate-600">{String(index + 1).padStart(2, "0")}</span>{" "}
                  {line}
                </p>
              ))}
              {loading && (
                <p className="text-indigo-300 animate-pulse">
                  <span className="text-slate-600">{String(logs.length + 1).padStart(2, "0")}</span>{" "}
                  BE 작업 진행 중...
                </p>
              )}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className={`rounded-xl border p-5 ${result.ok ? (isDark ? "bg-emerald-900/20 border-emerald-700/40" : "bg-emerald-50 border-emerald-200") : (isDark ? "bg-red-900/20 border-red-700/40" : "bg-red-50 border-red-200")}`}>
          {result.ok ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-lg">✓</span>
                <span className={`font-semibold text-sm ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>로그인 및 수집 성공</span>
              </div>
              <div className={`grid grid-cols-3 gap-3 text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                <div><p className="text-xs text-slate-500 mb-0.5">기업명</p><p className="font-medium">{result.companyName}</p></div>
                <div><p className="text-xs text-slate-500 mb-0.5">평점</p><p className="font-medium">{result.overallRating} / 5</p></div>
                <div><p className="text-xs text-slate-500 mb-0.5">리뷰 수</p><p className="font-medium">{result.reviewCount}개</p></div>
              </div>
              {result.welfare && (
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">복지 정보</p>
                  <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>{result.welfare}</p>
                </div>
              )}
              {result.preview && result.preview.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">리뷰 미리보기</p>
                  {result.preview.map((r, i) => (
                    <div key={i} className={`text-xs p-3 rounded-lg ${isDark ? "bg-slate-700/50" : "bg-white/70"}`}>
                      <p className={`font-medium mb-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>{r.title} · {r.rating}★ · {r.date}</p>
                      <p className={`${isDark ? "text-emerald-400" : "text-emerald-700"}`}>👍 {r.pros}</p>
                      <p className={`${isDark ? "text-red-400" : "text-red-700"}`}>👎 {r.cons}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-red-500 text-lg shrink-0">✕</span>
                <div>
                  <p className={`font-semibold text-sm mb-1 ${isDark ? "text-red-300" : "text-red-700"}`}>
                    테스트 실패{result.failedStep ? ` — ${result.failedStep}` : ""}
                  </p>
                  <p className={`text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>{result.error}</p>
                </div>
              </div>
              {result.finalUrl && (
                <div className={`text-xs font-mono px-3 py-2 rounded-lg ${isDark ? "bg-slate-700/50 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  최종 URL: {result.finalUrl}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CatchTestPanel({ isDark, user }: { isDark: boolean; user: ReturnType<typeof useAuth>["user"] }) {
  const [catchId, setCatchId] = useState(user?.catchId ?? "");
  const [catchPw, setCatchPw] = useState(user?.catchPassword ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CatchTestResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addClientLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  useEffect(() => {
    setCatchId(user?.catchId ?? "");
    setCatchPw(user?.catchPassword ?? "");
  }, [user?.catchId, user?.catchPassword]);

  const handleTest = async () => {
    if (!catchId || !catchPw) return;
    setLoading(true);
    setResult(null);
    setLogs([]);
    addClientLog("FE 요청 준비 완료");
    try {
      const token = tokenStore.get();
      addClientLog("BE 캐치 테스트 스트림 호출");
      const res = await fetch(`${API_BASE}/catch/test-login/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: catchId, password: catchPw }),
      });
      addClientLog(`BE 스트림 연결: HTTP ${res.status}`);
      if (!res.ok || !res.body) throw new Error(`스트림 연결 실패 (${res.status})`);

      await readSSE<CatchTestEvent>(res, (event) => {
        if (event.type === "log") {
          setLogs((prev) => [...prev, event.message]);
          return;
        }
        if (event.type === "error") {
          const line = `[${new Date().toISOString()}] ${event.message}`;
          setLogs((prev) => [...prev, line]);
          setResult({ ok: false, error: event.message, logs: [line] });
          return true;
        }
        setResult(event.result);
        if (event.result.logs?.length) setLogs(event.result.logs);
        return true;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "네트워크 오류";
      const errorLog = `[${new Date().toISOString()}] 요청 실패: ${message}`;
      setLogs((prev) => [...prev, errorLog]);
      setResult({ ok: false, error: message, logs: [errorLog] });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${isDark ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-slate-500" : "bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-slate-300"}`;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-5 space-y-4 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>캐치 ID</label>
            <input value={catchId} onChange={(e) => setCatchId(e.target.value)} placeholder="catch id" className={inputCls} />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>비밀번호</label>
            <input type="password" value={catchPw} onChange={(e) => setCatchPw(e.target.value)} placeholder="••••••••" className={inputCls} />
          </div>
        </div>
        <button
          onClick={handleTest}
          disabled={loading || !catchId || !catchPw}
          className="w-full py-2 text-sm font-semibold rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "캐치 로그인 테스트 중..." : "테스트 실행"}
        </button>
        {loading && (
          <p className={`text-xs text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            Puppeteer로 캐치에 로그인하고 세션 쿠키가 생성되는지 확인합니다.
          </p>
        )}
      </div>

      <div className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-950 border-slate-700" : "bg-slate-950 border-slate-200"}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <div>
            <p className="text-xs font-semibold text-slate-200">캐치 테스트 로그</p>
            <p className="text-[11px] text-slate-500">로그인 페이지 이동, API 로그인, DOM fallback, 세션 확인 단계를 표시합니다.</p>
          </div>
          <button
            onClick={() => setLogs([])}
            disabled={loading || logs.length === 0}
            className="px-2 py-1 text-[11px] font-semibold rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            지우기
          </button>
        </div>
        <div className="h-56 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-slate-500">테스트를 실행하면 단계별 로그가 여기에 표시됩니다.</p>
          ) : (
            <div className="space-y-1">
              {logs.map((line, index) => (
                <p key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-slate-300">
                  <span className="text-slate-600">{String(index + 1).padStart(2, "0")}</span>{" "}
                  {line}
                </p>
              ))}
              {loading && (
                <p className="text-cyan-300 animate-pulse">
                  <span className="text-slate-600">{String(logs.length + 1).padStart(2, "0")}</span>{" "}
                  BE 작업 진행 중...
                </p>
              )}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className={`rounded-xl border p-5 ${result.ok ? (isDark ? "bg-emerald-900/20 border-emerald-700/40" : "bg-emerald-50 border-emerald-200") : (isDark ? "bg-red-900/20 border-red-700/40" : "bg-red-50 border-red-200")}`}>
          {result.ok ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-lg">✓</span>
                <span className={`font-semibold text-sm ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                  캐치 로그인 성공{result.sessionReused ? " (저장된 세션 사용)" : ""}
                </span>
              </div>
              {result.finalUrl && (
                <div className={`text-xs font-mono px-3 py-2 rounded-lg ${isDark ? "bg-slate-700/50 text-slate-400" : "bg-white/70 text-slate-600"}`}>
                  최종 URL: {result.finalUrl}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-red-500 text-lg shrink-0">✕</span>
                <div>
                  <p className={`font-semibold text-sm mb-1 ${isDark ? "text-red-300" : "text-red-700"}`}>
                    테스트 실패{result.failedStep ? ` — ${result.failedStep}` : ""}
                  </p>
                  <p className={`text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>{result.error}</p>
                </div>
              </div>
              {result.finalUrl && (
                <div className={`text-xs font-mono px-3 py-2 rounded-lg ${isDark ? "bg-slate-700/50 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  최종 URL: {result.finalUrl}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PipelinePage() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === "dark";

  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");

  useEffect(() => {
    getModels().then(setModels);
  }, []);

  const cloudAiModels = models.filter((m) => m.provider !== "ollama");
  const localAiModels = models.filter((m) => m.provider === "ollama");

  const tabBarRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setCollapsed(el.scrollWidth > el.clientWidth + 2);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = () => setDropdownOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [dropdownOpen]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "pipeline", label: "파이프라인" },
    { id: "recruit", label: "채용 공고" },
    { id: "api", label: "API 모델" },
    { id: "local", label: "로컬 모델" },
    { id: "docparse", label: "문서 파싱" },
    { id: "rag", label: "RAG 디버그" },
    { id: "calllog", label: "호출 이력" },
    { id: "jobplanet", label: "잡플래닛 테스트" },
    { id: "catch", label: "캐치 테스트" },
  ];

  if (user?.role !== "admin") {
    return (
      <div className={`h-full flex items-center justify-center ${isDark ? "bg-slate-900" : "bg-white"}`}>
        <div className="text-center w-full max-w-sm px-6 py-12">
          <div className={`mx-auto w-16 h-16 flex items-center justify-center rounded-full mb-6 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
            <svg className={`w-8 h-8 ${isDark ? "text-slate-400" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className={`text-xl font-semibold mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>접근 권한 없음</h2>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            시스템 설정은 관리자만 접근할 수 있습니다.<br />계정 권한을 확인해주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col font-sans ${isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}`}>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-6xl w-full mx-auto">
        {/* Header Section */}
        <div className="px-8 pt-10 pb-6 shrink-0">
          <h1 className={`text-3xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>
            시스템 설정
          </h1>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            AI 파이프라인 및 백엔드 동작을 관리하고 테스트합니다.
          </p>

          {/* Tab bar (SaaS Style) */}
          <div className="mt-8 border-b border-slate-200 dark:border-slate-800">
            {/* Hidden row for measuring width */}
            <div ref={tabBarRef} className="flex gap-1 overflow-hidden pointer-events-none opacity-0 absolute">
              {tabs.map((tab) => (
                <span key={tab.id} className="px-4 py-2 text-sm font-medium whitespace-nowrap">{tab.label}</span>
              ))}
            </div>

            {collapsed ? (
              <div className="relative pb-3">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    isDark
                      ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <span>{tabs.find((t) => t.id === activeTab)?.label}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`ml-2 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}>
                    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {dropdownOpen && (
                  <div className={`absolute top-full left-0 mt-2 z-30 min-w-48 py-1 rounded-xl shadow-lg border ${
                    isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
                  }`}>
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          activeTab === tab.id
                            ? (isDark ? "bg-slate-700 text-white font-medium" : "bg-slate-50 text-slate-900 font-medium")
                            : (isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-50")
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-6 -mb-px">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                      activeTab === tab.id
                        ? (isDark)
                          ? "border-white text-white"
                          : "border-slate-900 text-slate-900"
                        : (isDark)
                          ? "border-transparent text-slate-400 hover:text-slate-300"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-8 pb-12 pt-2">
          {activeTab === "pipeline" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>파이프라인 통제 설정</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  시스템 내 각 파이프라인 단계를 관리하고 개별/순차적 구동 테스트를 수행합니다.
                </p>
              </div>
              <PipelineDiagram cloudAiModels={cloudAiModels} localAiModels={localAiModels} />
            </div>
          )}

          {activeTab === "recruit" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>채용 공고 모니터링</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  실시간 크롤링 및 웹 검색을 통한 채용 공고 수집 메커니즘을 테스트합니다.
                </p>
              </div>
              <RecruitTestPanel />
            </div>
          )}

          {activeTab === "api" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>API 모델 검증</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  퍼블릭 클라우드 AI 모델을 활용한 태스크 생성 통신을 검증합니다.
                </p>
              </div>
              <PromptTestPanel models={cloudAiModels} />
            </div>
          )}

          {activeTab === "docparse" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>문서 파서 동작 관리</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  다양한 문서 규격(PDF, DOCX)의 텍스트 추출 정확도 및 노이즈 제거율을 점검합니다.
                </p>
              </div>
              <DocParsePanel />
            </div>
          )}

          {activeTab === "rag" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>RAG 백엔드 쿼리 분석</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Vector DB 내부 컬렉션 간 유사도 점수 산출 및 검색 적합성을 평가합니다.
                </p>
              </div>
              <RagDebugPanel />
            </div>
          )}

          {activeTab === "calllog" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>AI 트랜잭션 로그</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  AI 모델로 발송된 요청 및 수신된 응답 페이로드를 추적합니다.
                </p>
              </div>
              <AiCallLogPanel />
            </div>
          )}

          {activeTab === "jobplanet" && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>잡플래닛 로그인 테스트</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  잡플래닛 로그인 및 기업 리뷰 수집이 정상적으로 동작하는지 확인합니다.
                </p>
              </div>
              <JobplanetTestPanel isDark={isDark} user={user} />
            </div>
          )}

          {activeTab === "catch" && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>캐치 로그인 테스트</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  캐치 로그인과 세션 쿠키 생성이 정상적으로 동작하는지 확인합니다.
                </p>
              </div>
              <CatchTestPanel isDark={isDark} user={user} />
            </div>
          )}

          {activeTab === "local" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h3 className={`text-base font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>로컬 엣지 모델</h3>
                <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  내부망 추론기(Ollama)에서 구동되는 로컬 모델의 동작 및 지연 시간을 검증합니다.
                </p>
              </div>
              {localAiModels.length > 0 ? (
                <PromptTestPanel models={localAiModels} />
              ) : (
                <div className={`mt-4 rounded-xl px-6 py-8 border ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
                  <h4 className={`text-sm font-semibold mb-1 ${isDark ? "text-slate-200" : "text-slate-900"}`}>로컬 모델 실행 안 됨</h4>
                  <p className={`text-sm mb-4 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Ollama 백그라운드 엔진이 실행 중이지 않거나 로드된 인퍼런스 모델이 없습니다.
                  </p>
                  <code className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium ${isDark ? "bg-slate-900 text-slate-300" : "bg-white border border-slate-200 text-slate-700"}`}>
                    $ ollama serve
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
