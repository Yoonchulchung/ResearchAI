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
  type CompetencyReasons,
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

function ScoreDetailTable({
  scores,
  reasons,
  isDark,
}: {
  scores: CompetencyScores;
  reasons: CompetencyReasons | null;
  isDark: boolean;
}) {
  const [openKey, setOpenKey] = useState<keyof CompetencyScores | null>(null);

  return (
    <div className={`rounded-sm border ${isDark ? "border-slate-600 bg-slate-800" : "border-slate-300 bg-white"}`}>
      <div className={`px-4 py-2 border-b ${isDark ? "border-slate-600 bg-slate-700/50" : "border-slate-300 bg-slate-50"}`}>
        <p className={`text-sm font-semibold tracking-wide ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          세부 분석 항목 {reasons && <span className="font-normal ml-2 text-blue-600 text-xs">상세 내역 보기</span>}
        </p>
      </div>
      <div className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-200"}`}>
        {COMPETENCY_LABELS.map(({ key, label }) => {
          const v = scores[key] ?? 0;
          const reason = reasons?.[key];
          const isOpen = openKey === key;

          return (
            <div key={key}>
              <button
                onClick={() => reason && setOpenKey(isOpen ? null : key)}
                className={`w-full flex items-center gap-4 px-4 py-3 text-sm transition-colors ${reason ? `cursor-pointer ${isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}` : "cursor-default"
                  } ${isOpen ? (isDark ? "bg-slate-700" : "bg-blue-50/50") : ""}`}
              >
                <span className={`w-28 text-left shrink-0 font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  {label}
                </span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-none overflow-hidden">
                  <div
                    className={`h-full transition-all ${v >= 80 ? "bg-blue-700"
                      : v >= 60 ? "bg-blue-500"
                        : v >= 40 ? "bg-slate-500"
                          : "bg-slate-400"
                      }`}
                    style={{ width: `${v}%` }}
                  />
                </div>
                <span className={`w-12 text-right font-mono text-sm shrink-0 ${v >= 70 ? "text-blue-700 font-semibold" : isDark ? "text-slate-400" : "text-slate-600"
                  }`}>
                  {v}
                </span>
                {reason ? (
                  <span className={`text-xs shrink-0 transition-transform ${isOpen ? "rotate-180" : ""} ${isDark ? "text-slate-400" : "text-slate-400"}`}>
                    ▼
                  </span>
                ) : (
                  <span className="w-2 shrink-0"></span> // Placeholder for alignment
                )}
              </button>

              {/* 근거 펼침 */}
              {isOpen && reason && (
                <div className={`px-4 py-3 ${isDark ? "bg-slate-700/80 border-t border-slate-600" : "bg-slate-50 border-t border-slate-200"}`}>
                  <div className="flex gap-3">
                    <div className="shrink-0 font-semibold text-xs text-blue-700 uppercase tracking-widest mt-0.5">평가 근거</div>
                    <div className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      {reason}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CompanyAnalysisPage() {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

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

  const runAnalysis = async (name: string) => {
    if (!name || analyzing) return;
    setAnalyzing(true);
    setProgressLogs([]);
    setError("");
    try {
      await analyzeCompanyStream(name, apiModel || undefined, (ev) => {
        if (ev.type === "log") setProgressLogs((p) => [...p, ev.message]);
        else if (ev.type === "searching") setProgressLogs((p) => [...p, "외부 데이터 수집 및 웹 검색 진행 중"]);
        else if (ev.type === "scoring") setProgressLogs((p) => [...p, "인재상 기반 역량 모델 분석 처리 중"]);
        else if (ev.type === "done") {
          setSelected(ev.result);
          setSearchQuery("");
          refreshList();
        } else if (ev.type === "error") setError(ev.message);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 처리 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyze = () => runAnalysis(searchQuery.trim());
  const handleReanalyze = (companyName: string) => runAnalysis(companyName);

  const handleSelect = async (companyKey: string) => {
    try {
      const detail = await getCompanyAnalysis(companyKey);
      setSelected(detail);
    } catch { }
  };

  const handleDelete = async (companyKey: string) => {
    if (!confirm("해당 기업 분석 데이터를 삭제하시겠습니까?")) return;
    await deleteCompanyAnalysis(companyKey);
    if (selected?.companyKey === companyKey) setSelected(null);
    refreshList();
  };

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
    <div className={`h-full flex flex-col font-sans overflow-hidden transition-all ${isGlass ? "p-3 bg-transparent" : isDark ? "bg-slate-900" : "bg-[#f4f5f7]"}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl border " + (isDark ? "border-white/20" : "border-black/5") : ""}`}>
        {/* 상단 헤더 영역 */}
        <div className={`px-6 py-4 shrink-0 border-b ${isGlass ? (isDark ? "border-white/20" : "border-black/5") : isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-sm ${isDark ? "bg-slate-900 border-slate-600 focus-within:border-blue-500" : "bg-white border-slate-400 focus-within:border-blue-600"
              }`}>
              <svg className={`w-4 h-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
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
                placeholder="대상 기업명을 검색하거나 신규 분석을 위해 입력하십시오"
                className={`flex-1 text-sm bg-transparent focus:outline-none ${isDark ? "text-slate-200 placeholder-slate-500" : "text-slate-800 placeholder-slate-400"}`}
              />
            </div>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={modelsLoading || analyzing}
              className={`w-full md:w-48 text-sm px-3 py-2 border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-600 appearance-none ${isDark ? "bg-slate-900 border-slate-600 text-slate-200" : "bg-white border-slate-400 text-slate-800"
                }`}
              style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7rem top 50%', backgroundSize: '.65rem auto' }}
            >
              <option value={DEFAULT_FREE_MODEL_ID}>Gemini Model</option>
              {cloudAiModels.length > 0 && (
                <optgroup label="Cloud Models">
                  {cloudAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
              {localAiModels.length > 0 && (
                <optgroup label="Local Models">
                  {localAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
            </select>

            {searchQuery.trim() && !exactMatch && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className={`w-full md:w-auto px-5 py-2 text-sm font-semibold rounded-sm border shrink-0 transition-colors ${isDark
                  ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  : "bg-slate-800 border-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"
                  }`}
              >
                {analyzing ? "처리 중..." : "분석 실행"}
              </button>
            )}
          </div>

          {(analyzing || progressLogs.length > 0 || error) && (
            <div className={`mt-3 px-4 py-2 border rounded-sm text-sm font-mono ${error ? "bg-red-50 text-red-700 border-red-300"
              : isDark ? "bg-slate-900 text-slate-400 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-300"
              }`}>
              {error ? <div>[오류] {error}</div> : (
                <div className="flex flex-col gap-1 text-xs">
                  {progressLogs.slice(-3).map((l, i) => <div key={i}>{'>'} {l}</div>)}
                  {analyzing && <div className="text-blue-600 mt-1">{'>'} 프로세싱 중입니다. 잠시만 기다려 주십시오.</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 본문 영역 */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* 좌측 패널: 기업 목록 */}
          <div className={`w-full md:w-72 h-40 md:h-auto shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}>
            {loadingList ? (
              <div className={`p-5 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>데이터 불러오는 중...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className={`p-6 text-sm text-center border-b ${isDark ? "text-slate-500 border-slate-700" : "text-slate-400 border-slate-200"}`}>
                해당하는 데이터가 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredCompanies.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => handleSelect(c.companyKey)}
                      className={`w-full text-left px-4 py-3 transition-colors ${selected?.companyKey === c.companyKey
                        ? (isDark ? "bg-slate-700/50 border-l-4 border-blue-500" : "bg-blue-50/50 border-l-4 border-blue-700")
                        : (isDark ? "hover:bg-slate-700/30 border-l-4 border-transparent" : "hover:bg-slate-50 border-l-4 border-transparent")
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>{c.companyName}</span>
                        <div
                          role="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(c.companyKey); }}
                          className={`text-xs px-1 hover:text-red-600 ${isDark ? "text-slate-500" : "text-slate-400"}`}
                          title="삭제"
                        >
                          ✕
                        </div>
                      </div>
                      <p className={`text-xs mt-1 font-mono ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                        {new Date(c.updatedAt).toISOString().split('T')[0]}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 우측 패널: 상세 분석 내용 */}
          <div className={`flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8 ${isGlass ? "" : isDark ? "bg-slate-900" : "bg-[#f4f5f7]"}`}>
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className={`w-16 h-16 mb-4 border-2 rounded ${isDark ? "border-slate-700 text-slate-700" : "border-slate-300 text-slate-300"} flex items-center justify-center`}>
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M9 17v-2m4 2v-4m4 4V9M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>상단 검색창에 대상 기업명을 입력하여 자동 수집 및 분석을 실행하십시오.</p>
              </div>
            ) : (
              <div className="max-w-5xl mx-auto space-y-6">

                <div className={`flex items-end justify-between border-b pb-4 ${isDark ? "border-slate-700" : "border-slate-300"}`}>
                  <div>
                    <h2 className={`text-3xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                      {selected.companyName}
                    </h2>
                    <p className={`text-sm mt-2 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      DATE: {new Date(selected.updatedAt).toLocaleString("en-US", { hour12: false })} | MODEL: {selected.aiModel || "Unknown"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleReanalyze(selected.companyName)}
                    disabled={analyzing}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border rounded-sm transition-colors ${isDark
                      ? "border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      : "border-slate-400 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      }`}
                  >
                    재분석 실행
                  </button>
                </div>

                {selected.summary && (
                  <section className={`p-5 border-l-4 rounded-r-sm ${isDark ? "bg-slate-800 border-blue-600" : "bg-white border-blue-800 shadow-sm"}`}>
                    <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 ${isDark ? "text-blue-400" : "text-blue-800"}`}>Overall Summary</h3>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.summary}</p>
                  </section>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* 레이더 차트 (좌측) */}
                  <section className={`border rounded-sm p-6 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`}>
                    <div className={`border-b pb-3 mb-4 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                      <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-800"}`}>역량 프로파일</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={380}>
                      <RadarChart data={radarData} outerRadius="70%">
                        <PolarGrid stroke={isDark ? "#475569" : "#cbd5e1"} />
                        <PolarAngleAxis
                          dataKey="subject"
                          tick={{ fill: isDark ? "#cbd5e1" : "#475569", fontSize: 11, fontWeight: 500 }}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 10 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            borderColor: isDark ? '#334155' : '#e2e8f0',
                            color: isDark ? '#f8fafc' : '#0f172a',
                            fontSize: '12px',
                            borderRadius: '2px',
                            boxShadow: 'none'
                          }}
                        />
                        {companies.length > 0 && (
                          <Radar
                            name="시장 평균 (Market Avg)"
                            dataKey="avg"
                            stroke={isDark ? "#64748b" : "#cbd5e1"}
                            strokeDasharray="3 3"
                            fill="none"
                            strokeWidth={1.5}
                          />
                        )}
                        <Radar
                          name={selected.companyName}
                          dataKey="value"
                          stroke={isDark ? "#3b82f6" : "#1d4ed8"}
                          fill={isDark ? "#3b82f6" : "#1d4ed8"}
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                        <Legend wrapperStyle={{ paddingTop: 20, fontSize: 11, fontFamily: 'monospace' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </section>

                  {/* 세부 점수 테이블 (우측) */}
                  <div className="space-y-6">
                    <ScoreDetailTable
                      scores={selected.scores}
                      reasons={selected.reasons}
                      isDark={isDark}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selected.financialSummary && (
                    <section className={`border rounded-sm p-5 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`}>
                      <div className={`border-b pb-3 mb-3 flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                        <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-800"}`}>재무 현황 (Financial Data)</h3>
                        <span className="text-[10px] font-mono text-slate-500 border px-1 border-slate-500">DART</span>
                      </div>
                      <pre className={`text-sm leading-relaxed font-sans whitespace-pre-wrap ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {selected.financialSummary}
                      </pre>
                    </section>
                  )}

                  {selected.jobplanetSummary && (
                    <section className={`border rounded-sm p-5 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`}>
                      <div className={`border-b pb-3 mb-3 flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                        <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-800"}`}>조직 문화 (Corporate Culture)</h3>
                        <span className="text-[10px] font-mono text-slate-500 border px-1 border-slate-500">REVIEW</span>
                      </div>
                      <pre className={`text-sm leading-relaxed font-sans whitespace-pre-wrap ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {selected.jobplanetSummary}
                      </pre>
                    </section>
                  )}
                </div>

                {selected.evidence && selected.evidence.length > 0 && (
                  <section className={`border rounded-sm p-5 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`}>
                    <div className={`border-b pb-3 mb-3 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                      <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-800"}`}>참고 문헌 (References)</h3>
                    </div>
                    <ul className="space-y-2">
                      {selected.evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className={`text-xs mt-0.5 font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>[{i + 1}]</span>
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-sm hover:underline truncate block ${isDark ? "text-blue-400" : "text-blue-700"}`}
                          >
                            {e.title || e.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
