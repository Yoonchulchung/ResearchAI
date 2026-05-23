"use client";

import { Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

import type { Experience } from "@/lib/api/experiences";
import type { SavedDocument } from "@/lib/api/documents";
import { extractExperiencesFromDoc } from "@/lib/api/experiences";
import { useDocuments } from "./_hooks/useDocuments";
import { useExperiences } from "./_hooks/useExperiences";
import { useCardPopup } from "./_hooks/useCardPopup";
import { useAiSuggest } from "./_hooks/useAiSuggest";
import { CardPopup } from "./_components/CardPopup";
import { DocsTab } from "./_components/DocsTab";
import { ExperienceModal } from "./_components/ExperienceModal";
import { ExperienceTab } from "./_components/ExperienceTab";
import { ExtractExpModal } from "./_components/ExtractExpModal";
import { SmartInsightsModal } from "./_components/SmartInsightsModal";
import { IconPlus } from "./_components/icons";

function DocStorePageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"docs" | "exp">(
    searchParams.get("tab") === "exp" ? "exp" : "docs",
  );
  const [extracting, setExtracting] = useState(false);
  const [extractModal, setExtractModal] = useState<{
    doc: SavedDocument;
    items: { title: string; content: string }[];
  } | null>(null);
  const [selectedInsightDoc, setSelectedInsightDoc] = useState<SavedDocument | null>(null);

  const docs = useDocuments();
  const exp = useExperiences();
  const popup = useCardPopup();
  const ai = useAiSuggest(exp.experiences);

  const handleDocExtract = async (doc: SavedDocument) => {
    popup.closePopup();
    setExtracting(true);
    try {
      const items = await extractExperiencesFromDoc(doc.content, "claude-haiku-4-5-20251001");
      setExtractModal({ doc, items });
    } finally {
      setExtracting(false);
    }
  };

  // 팝업 닫기 + 삭제 조합 핸들러
  const handleDocDelete = (id: string) => {
    popup.closePopup();
    docs.handleDocDelete(id);
  };

  const handleExpDelete = (id: string) => {
    popup.closePopup();
    exp.handleExpDelete(id);
  };

  const handleExpEdit = (experience: Experience) => {
    popup.closePopup();
    exp.openEdit(experience);
  };

  const handleApplyCategory = (experience: Experience, category: string) =>
    exp.updateExpCategory(experience.id, category);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F4F5F7]">
      {/* Header: 탭 + 검색 + 액션 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-200/60 shrink-0">
        {/* Tabs */}
        <button
          onClick={() => setTab("docs")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            tab === "docs" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          저장된 문서
          {docs.documents.length > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === "docs" ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
              {docs.documents.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("exp")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            tab === "exp" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          경험
          {exp.experiences.length > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === "exp" ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
              {exp.experiences.length}
            </span>
          )}
        </button>

        <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

        {/* 검색 */}
        {tab === "docs" && (
          <input
            value={docs.docSearch}
            onChange={(e) => docs.setDocSearch(e.target.value)}
            placeholder="문서 검색..."
            className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200 w-44"
          />
        )}
        {tab === "exp" && (
          <input
            value={exp.expSearch}
            onChange={(e) => exp.setExpSearch(e.target.value)}
            placeholder="경험 검색..."
            className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-200 w-44"
          />
        )}

        <div className="flex-1" />

        {/* 액션 버튼 */}
        {tab === "docs" && (
          <button
            onClick={() => { window.location.href = "/recruit/write"; }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <IconPlus /> 자소서 작성
          </button>
        )}
        {tab === "exp" && (
          <button
            onClick={exp.openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <IconPlus /> 경험 추가
          </button>
        )}
      </div>

      {tab === "docs" && (
        <DocsTab
          docsLoading={docs.docsLoading}
          filteredDocs={docs.filteredDocs}
          docSearch={docs.docSearch}
          setDocSearch={docs.setDocSearch}
          activePopup={popup.activePopup}
          onDocOpen={(doc) => { window.location.href = `/recruit/write?docId=${doc.id}`; }}
          onDetailClick={(doc) => {
            if (popup.activePopup) popup.closePopup();
            setSelectedInsightDoc(doc);
          }}
        />
      )}

      {tab === "exp" && (
        <ExperienceTab
          expLoading={exp.expLoading}
          filteredExp={exp.filteredExp}
          expSearch={exp.expSearch}
          setExpSearch={exp.setExpSearch}
          categoryFilter={exp.categoryFilter}
          setCategoryFilter={exp.setCategoryFilter}
          allCategories={exp.allCategories}
          activePopup={popup.activePopup}
          onCardClick={(experience, el) => {
            if (popup.activePopup?.data.id === experience.id) { popup.closePopup(); return; }
            popup.openPopup("exp", experience, el);
          }}
          onOpenAdd={exp.openAdd}
          aiModel={ai.aiModel}
          setAiModel={ai.setAiModel}
          aiSuggestions={ai.aiSuggestions}
          suggestingIds={ai.suggestingIds}
          suggestingAll={ai.suggestingAll}
          onSuggestAll={() => ai.handleSuggestAll(exp.filteredExp)}
          onClearSuggestions={ai.clearSuggestions}
        />
      )}

      {exp.modalOpen && (
        <ExperienceModal
          initial={exp.editTarget}
          onSave={exp.handleExpSave}
          onClose={() => exp.setModalOpen(false)}
        />
      )}

      {extracting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-xl px-6 py-5 flex items-center gap-3">
            <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-600">AI가 경험을 추출하고 있습니다...</span>
          </div>
        </div>
      )}

      {extractModal && (
        <ExtractExpModal
          docId={extractModal.doc.id}
          docTitle={extractModal.doc.title}
          items={extractModal.items}
          onClose={() => setExtractModal(null)}
          onSaved={() => { exp.reload(); setTab("exp"); }}
        />
      )}

      {selectedInsightDoc && (
        <SmartInsightsModal
          doc={selectedInsightDoc}
          onClose={() => setSelectedInsightDoc(null)}
          onSaved={() => { exp.reload(); setTab("exp"); setSelectedInsightDoc(null); }}
          onDocOpen={(id) => { window.location.href = `/recruit/write?docId=${id}`; }}
          onDocDelete={handleDocDelete}
        />
      )}

      {popup.activePopup && createPortal(
        <CardPopup
          activePopup={popup.activePopup}
          popupVisible={popup.popupVisible}
          aiSuggestions={ai.aiSuggestions}
          suggestingIds={ai.suggestingIds}
          onClose={popup.closePopup}
          onDocOpen={(id) => { window.location.href = `/recruit/write?docId=${id}`; }}
          onDocDelete={handleDocDelete}
          onDocExtract={handleDocExtract}
          onExpEdit={handleExpEdit}
          onExpDelete={handleExpDelete}
          onSuggestOne={ai.handleSuggestOne}
          onApplyCategory={handleApplyCategory}
        />,
        document.body,
      )}
    </div>
  );
}

export default function DocStorePage() {
  return (
    <Suspense>
      <DocStorePageInner />
    </Suspense>
  );
}
