"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useModels } from "@/sessions/new/hooks/useModels";
import { DEFAULT_FREE_MODEL_ID } from "@/sessions/new/hooks/useNewSession";
import type { CompanyAnalysis } from "@/lib/api/company-analysis";
import { useCompanyList } from "./_hooks/useCompanyList";
import { useAnalysisRunner } from "./_hooks/useAnalysisRunner";
import { useCompanyChat } from "./_hooks/useCompanyChat";
import { CompanyList } from "./_components/CompanyList";
import { AnalysisProgressPanel } from "./_components/AnalysisProgressPanel";
import { CompanyDetail } from "./_components/CompanyDetail";
import { CompanyChatPanel } from "./_components/CompanyChatPanel";

const SELECT_ARROW_SVG = 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")';

function CompanyAnalysisInner() {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const searchParams = useSearchParams();
  const initialUrlHandled = useRef(false);

  const { cloudAiModels, localAiModels, isLoading: modelsLoading } = useModels();
  const [selectedModel, setSelectedModel] = useState("");
  useEffect(() => {
    if (selectedModel || modelsLoading) return;
    setSelectedModel(cloudAiModels[0]?.id ?? DEFAULT_FREE_MODEL_ID);
  }, [cloudAiModels, modelsLoading, selectedModel]);

  const {
    companies, loadingList, searchQuery, setSearchQuery,
    selected, setSelected, refreshList, handleSelect, handleDelete,
    filteredCompanies, exactMatch,
  } = useCompanyList();

  const [reliabilityOpen, setReliabilityOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const apiModel = selectedModel === DEFAULT_FREE_MODEL_ID ? "" : selectedModel;

  const handleDone = useCallback((result: CompanyAnalysis) => {
    setSelected(result);
    setSearchQuery("");
    refreshList();
  }, [setSelected, setSearchQuery, refreshList]);

  const {
    activeAnalysisNames, analysisProgressItems, progressPercent,
    progressLogs, logsVisible, setLogsVisible, error, setError,
    isAnalyzing, isCompanyAnalyzing, runAnalysis,
  } = useAnalysisRunner({ apiModel, onDone: handleDone, onError: () => {} });

  const chat = useCompanyChat({ selected, cloudAiModels, localAiModels });

  const selectedCompanyIsAnalyzing = selected ? isCompanyAnalyzing(selected.companyName) : false;
  const searchCompanyIsAnalyzing = searchQuery.trim() ? isCompanyAnalyzing(searchQuery.trim()) : false;

  // URL param: ?company=기업명 → auto-select on first load
  useEffect(() => {
    if (companies.length === 0 || initialUrlHandled.current) return;
    initialUrlHandled.current = true;
    const companyParam = searchParams.get("company");
    const errorParam = searchParams.get("error");
    if (errorParam) setError(decodeURIComponent(errorParam));
    if (companyParam) {
      setSearchQuery(companyParam);
      const found = companies.find(
        (c) => c.companyName === companyParam || c.companyKey === companyParam,
      );
      if (found) handleSelect(found.companyKey);
    }
  }, [companies]);

  useEffect(() => { refreshList(); }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [progressLogs]);

  // Mobile back button — detail → list
  const hasPushedDetailStateRef = useRef(false);
  useEffect(() => {
    if (!selected) {
      hasPushedDetailStateRef.current = false;
      return;
    }
    if (typeof window !== "undefined" && window.innerWidth < 768 && !hasPushedDetailStateRef.current) {
      window.history.pushState({ detailOpen: true }, "");
      hasPushedDetailStateRef.current = true;
    }
    const handlePopState = () => {
      hasPushedDetailStateRef.current = false;
      setSelected(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selected]);

  const handleAnalyze = () => runAnalysis(searchQuery.trim());
  const handleReanalyze = (companyName: string) => runAnalysis(companyName);

  return (
    <>
      <div className={`h-full flex flex-col font-sans overflow-hidden transition-all ${isGlass ? "p-3 bg-transparent" : isDark ? "bg-slate-900" : "bg-[#f4f5f7]"}`}>
        <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl border " + (isDark ? "border-white/20" : "border-black/5") : ""}`}>

          {/* 상단 헤더 */}
          <div className={`px-6 py-4 shrink-0 border-b ${selected ? "hidden md:block" : ""} ${isGlass ? (isDark ? "border-white/20" : "border-black/5") : isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-sm ${isDark ? "bg-slate-900 border-slate-600 focus-within:border-blue-500" : "bg-white border-slate-400 focus-within:border-blue-600"}`}>
                <svg className={`w-4 h-4 shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !searchCompanyIsAnalyzing && searchQuery.trim() && !exactMatch) handleAnalyze();
                    else if (e.key === "Enter" && exactMatch) setSelected(exactMatch);
                  }}
                  placeholder="기업명 검색 또는 신규 분석 입력"
                  className={`flex-1 min-w-0 text-sm bg-transparent focus:outline-none ${isDark ? "text-slate-200 placeholder-slate-500" : "text-slate-800 placeholder-slate-400"}`}
                />
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={modelsLoading}
                  className={`flex-1 sm:flex-none sm:w-48 text-xs sm:text-sm px-2 sm:px-3 py-2 border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-600 appearance-none ${isDark ? "bg-slate-900 border-slate-600 text-slate-200" : "bg-white border-slate-400 text-slate-800"}`}
                  style={{ backgroundImage: SELECT_ARROW_SVG, backgroundRepeat: "no-repeat", backgroundPosition: "right .7rem top 50%", backgroundSize: ".65rem auto" }}
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
                    disabled={searchCompanyIsAnalyzing}
                    className={`shrink-0 px-4 py-2 text-sm font-semibold rounded-sm border transition-colors ${isDark ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" : "bg-slate-800 border-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"}`}
                  >
                    {searchCompanyIsAnalyzing ? "분석 중" : "분석 실행"}
                  </button>
                )}
              </div>
            </div>

            <AnalysisProgressPanel
              error={error}
              isAnalyzing={isAnalyzing}
              analysisProgressItems={analysisProgressItems}
              progressPercent={progressPercent}
              progressLogs={progressLogs}
              logsVisible={logsVisible}
              setLogsVisible={setLogsVisible}
              activeAnalysisNames={activeAnalysisNames}
              isDark={isDark}
              logEndRef={logEndRef}
            />
          </div>

          {/* 바디: 좌측 목록 + 우측 상세 */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <CompanyList
              filteredCompanies={filteredCompanies}
              selected={selected}
              loadingList={loadingList}
              isGlass={isGlass}
              isDark={isDark}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />

            {/* 우측 상세 */}
            <div
              onScroll={chat.handleDetailScroll}
              className={`flex-1 overflow-y-auto px-2 py-3 md:px-10 md:py-8 ${!selected ? "hidden md:block" : ""} ${isGlass ? "" : isDark ? "bg-slate-900" : "bg-[#f4f5f7]"}`}
            >
              {selected ? (
                <CompanyDetail
                  selected={selected}
                  companies={companies}
                  isDark={isDark}
                  isGlass={isGlass}
                  selectedCompanyIsAnalyzing={selectedCompanyIsAnalyzing}
                  reliabilityOpen={reliabilityOpen}
                  setReliabilityOpen={setReliabilityOpen}
                  onBack={() => setSelected(null)}
                  onReanalyze={handleReanalyze}
                  onScroll={chat.handleDetailScroll}
                />
              ) : (
                <div className="h-full" />
              )}
            </div>
          </div>
        </div>
      </div>

      <CompanyChatPanel
        chatOpen={chat.chatOpen}
        setChatOpen={chat.setChatOpen}
        isChatBtnVisible={chat.isChatBtnVisible}
        chatBtnRef={chat.chatBtnRef}
        chatPanelRef={chat.chatPanelRef}
        chatEndRef={chat.chatEndRef}
        chatInputRef={chat.chatInputRef}
        selected={selected}
        chatMessages={chat.chatMessages}
        setChatMessages={chat.setChatMessages}
        chatLoading={chat.chatLoading}
        chatModel={chat.chatModel}
        setChatModel={chat.setChatModel}
        chatInput={chat.chatInput}
        setChatInput={chat.setChatInput}
        sendChatMessage={chat.sendChatMessage}
        cloudAiModels={cloudAiModels}
        localAiModels={localAiModels}
        reliabilityOpen={reliabilityOpen}
        isDark={isDark}
      />
    </>
  );
}

export default function CompanyAnalysisPage() {
  return (
    <Suspense>
      <CompanyAnalysisInner />
    </Suspense>
  );
}
