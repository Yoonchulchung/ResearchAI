"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { useTheme } from "@/contexts/ThemeContext";
import { useModels } from "@/sessions/new/hooks/useModels";
import { DEFAULT_FREE_MODEL_ID } from "@/sessions/new/hooks/useNewSession";
import {
  listCompanyAnalyses,
  getCompanyAnalysis,
  deleteCompanyAnalysis,
  analyzeCompanyStream,
  type CompanyAnalysis,
  type CompetencyScores,
} from "@/lib/api/company-analysis";

const COMPETENCY_LABELS: Array<{ key: keyof CompetencyScores; label: string }> = [
  { key: "성취지향", label: "성취지향" },
  { key: "도전정신", label: "도전정신" },
  { key: "주도성", label: "주도성" },
  { key: "문제해결", label: "문제해결" },
  { key: "의사소통", label: "의사소통" },
  { key: "대인관계", label: "대인관계" },
  { key: "열정", label: "열정" },
  { key: "주인의식", label: "주인의식" },
  { key: "팀워크", label: "팀워크" },
  { key: "자원계획관리", label: "자원 계획·관리" },
  { key: "치밀성", label: "치밀성" },
  { key: "분석적사고", label: "분석적 사고" },
  { key: "전문성", label: "전문성" },
];

export default function CompanyAnalysisPage() {
  const { theme, uiStyle } = useTheme();
  const isGlass = uiStyle === "glass";
  const isDark = theme === "dark";

  const { cloudAiModels, localAiModels, isLoading: modelsLoading } = useModels();
  const [selectedModel, setSelectedModel] = useState("");
  useEffect(() => {
    if (selectedModel || modelsLoading) return;
    setSelectedModel(cloudAiModels[0]?.id ?? DEFAULT_FREE_MODEL_ID);
  }, [cloudAiModels, modelsLoading, selectedModel]);

  const [companies, setCompanies] = useState<CompanyAnalysis[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<CompanyAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [error, setError] = useState("");

  const refreshList = async () => {
    setLoadingList(true);
    try {
      setCompanies(await listCompanyAnalyses());
    } catch {
      setCompanies([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { refreshList(); }, []);

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => c.companyName.toLowerCase().includes(q));
  }, [companies, searchQuery]);

  const exactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return null;
    return companies.find(
      (c) => c.companyName.toLowerCase().replace(/\s+/g, "") === q || c.companyKey === q,
    );
  }, [companies, searchQuery]);

  const apiModel = selectedModel === DEFAULT_FREE_MODEL_ID ? "" : selectedModel;

  const handleAnalyze = async () => {
    const name = searchQuery.trim();
    if (!name || analyzing) return;
    setAnalyzing(true);
    setProgressLogs([]);
    setError("");
    try {
      await analyzeCompanyStream(name, apiModel || undefined, (ev) => {
        if (ev.type === "log") setProgressLogs((p) => [...p, ev.message]);
        else if (ev.type === "searching") setProgressLogs((p) => [...p, "🌐 웹 검색 진행 중..."]);
        else if (ev.type === "scoring") setProgressLogs((p) => [...p, "🤖 AI 인재상 분석 중..."]);
        else if (ev.type === "done") {
          setSelected(ev.result);
          setSearchQuery("");
          refreshList();
        } else if (ev.type === "error") setError(ev.message);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSelect = async (companyKey: string) => {
    try {
      const detail = await getCompanyAnalysis(companyKey);
      setSelected(detail);
    } catch {}
  };

  const handleDelete = async (companyKey: string) => {
    if (!confirm("이 기업 분석을 삭제하시겠어요?")) return;
    await deleteCompanyAnalysis(companyKey);
    if (selected?.companyKey === companyKey) setSelected(null);
    refreshList();
  };

  // ── 레이더 차트 데이터 변환 (선택 기업 점수 + 전체 평균을 단일 배열로 병합) ─
  const radarData = useMemo(() => {
    if (!selected) return [];
    return COMPETENCY_LABELS.map(({ key, label }) => {
      const avg = companies.length > 0
        ? Math.round(companies.reduce((s, c) => s + (c.scores[key] ?? 0), 0) / companies.length)
        : 0;
      return {
        subject: label,
        value: selected.scores[key] ?? 0,
        avg,
        fullMark: 100,
      };
    });
  }, [selected, companies]);

  return (
    <div className={`h-full flex flex-col overflow-hidden ${isGlass ? "p-3 pr-4 pb-4 bg-transparent" : "bg-slate-100"}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl border border-white/20" : ""}`}>
        {/* ── 상단 헤더: 검색 + 모델 선택 ──────────────────────────── */}
        <div className={`px-6 py-3 shrink-0 ${isGlass ? `border-b ${isDark ? "border-white/20" : "border-black/10"}` : `bg-white border-b ${isDark ? "border-slate-700/50" : "border-slate-200/60"}`}`}>
          <div className="flex items-center gap-3 mb-2">
            <h1 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-800"}`}>📊 기업 분석</h1>
            <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>
              인재상 핵심 역량 자동 매핑
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border ${
              isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
            }`}>
              <span className="text-slate-400">🔍</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !analyzing && searchQuery.trim() && !exactMatch) {
                    handleAnalyze();
                  } else if (e.key === "Enter" && exactMatch) {
                    setSelected(exactMatch);
                  }
                }}
                placeholder="기업명을 검색하거나 새로 분석할 기업을 입력하세요 (예: 카카오, 토스, 삼성전자)"
                className={`flex-1 text-sm bg-transparent focus:outline-none ${isDark ? "text-white placeholder-white/30" : "text-slate-700 placeholder-slate-400"}`}
              />
            </div>

            {/* AI 모델 선택 */}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={modelsLoading || analyzing}
              className={`text-xs px-3 py-2 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer ${
                isDark ? "bg-white/5 border-white/10 text-white" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              <option value={DEFAULT_FREE_MODEL_ID}>☁️ Gemini (무료)</option>
              {cloudAiModels.length > 0 && (
                <optgroup label="클라우드 AI">
                  {cloudAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
              {localAiModels.length > 0 && (
                <optgroup label="로컬 모델">
                  {localAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
            </select>

            {/* 분석 버튼 */}
            {searchQuery.trim() && !exactMatch && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
              >
                {analyzing ? "분석 중..." : "✨ AI 분석"}
              </button>
            )}
          </div>

          {/* 진행 상황 / 에러 */}
          {(analyzing || progressLogs.length > 0 || error) && (
            <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${
              error ? "bg-red-50 text-red-600 border border-red-200"
              : isDark ? "bg-white/5 text-white/70" : "bg-slate-50 text-slate-600 border border-slate-100"
            }`}>
              {error ? <p>❌ {error}</p> : (
                <div className="space-y-0.5">
                  {progressLogs.slice(-3).map((l, i) => <p key={i}>{l}</p>)}
                  {analyzing && <p className="text-indigo-500 font-medium">⏳ 진행 중... (10~30초 소요)</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 본문: 좌측 기업 목록 + 우측 상세 ────────────────────── */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* 좌측: 분석된 기업 목록 */}
          <div className={`w-72 shrink-0 overflow-y-auto border-r ${
            isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-200 bg-white"
          }`}>
            <div className="px-4 py-3 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-100 bg-white/80">
              <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-white/60" : "text-slate-500"}`}>
                분석된 기업 {companies.length > 0 && `(${companies.length})`}
              </p>
            </div>
            {loadingList ? (
              <div className="p-4 text-sm text-slate-400">로딩 중...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                {searchQuery.trim() ? "검색 결과 없음 — AI 분석으로 추가하세요" : "분석된 기업이 없습니다.\n상단 검색바에 기업명을 입력하고 AI 분석을 실행하세요."}
              </div>
            ) : (
              <ul className="py-1">
                {filteredCompanies.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => handleSelect(c.companyKey)}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${
                        selected?.companyKey === c.companyKey
                          ? "bg-indigo-50 text-indigo-700 border-l-2 border-indigo-500"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{c.companyName}</span>
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(c.companyKey); }}
                          className="text-xs text-slate-300 hover:text-red-500 shrink-0"
                          title="삭제"
                        >
                          ✕
                        </span>
                      </div>
                      <p className="text-2xs text-slate-400 mt-0.5">
                        {new Date(c.updatedAt).toLocaleDateString("ko-KR")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 우측: 상세 (레이더 차트) */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                <span className="text-5xl">📊</span>
                <p className="text-sm font-medium">왼쪽에서 기업을 선택하거나, 상단에서 새 기업을 검색하세요</p>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-4">
                {/* 기업 헤더 */}
                <div>
                  <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                    {selected.companyName}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    분석 일시: {new Date(selected.updatedAt).toLocaleString("ko-KR")}
                    {selected.aiModel && <span className="ml-2">· AI: {selected.aiModel}</span>}
                  </p>
                </div>

                {/* 인재상 요약 */}
                {selected.summary && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-1">💡 인재상 요약</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{selected.summary}</p>
                  </div>
                )}

                {/* 레이더 차트 */}
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 shadow-sm">
                  <h3 className="text-center text-sm font-bold text-slate-700 mb-2">세부 역량</h3>
                  <ResponsiveContainer width="100%" height={420}>
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: "#475569", fontSize: 12 }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                      />
                      <Tooltip />
                      {companies.length > 0 && (
                        <Radar
                          name="전체 평균"
                          dataKey="avg"
                          stroke="#cbd5e1"
                          strokeDasharray="4 3"
                          fill="#cbd5e1"
                          fillOpacity={0.15}
                        />
                      )}
                      <Radar
                        name={selected.companyName}
                        dataKey="value"
                        stroke="#4f7cff"
                        fill="#4f7cff"
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* 점수 표 */}
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">점수 상세</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                    {COMPETENCY_LABELS.map(({ key, label }) => {
                      const v = selected.scores[key] ?? 0;
                      return (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <span className="w-24 text-slate-700 shrink-0">{label}</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                v >= 80 ? "bg-indigo-500"
                                : v >= 60 ? "bg-indigo-400"
                                : v >= 40 ? "bg-slate-400"
                                : "bg-slate-300"
                              }`}
                              style={{ width: `${v}%` }}
                            />
                          </div>
                          <span className={`w-10 text-right font-mono text-sm ${
                            v >= 70 ? "text-indigo-600 font-bold" : "text-slate-600"
                          }`}>
                            {v}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 출처 */}
                {selected.evidence && selected.evidence.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">분석 근거</p>
                    <ul className="space-y-1">
                      {selected.evidence.slice(0, 8).map((e, i) => (
                        <li key={i}>
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline truncate block"
                          >
                            {e.title || e.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
