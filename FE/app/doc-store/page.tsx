"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Experience } from "@/lib/api/experiences";
import { useDocuments } from "./_hooks/useDocuments";
import { useExperiences } from "./_hooks/useExperiences";
import { useCardPopup } from "./_hooks/useCardPopup";
import { useAiSuggest } from "./_hooks/useAiSuggest";
import { CardPopup } from "./_components/CardPopup";
import { DocsTab } from "./_components/DocsTab";
import { ExperienceModal } from "./_components/ExperienceModal";
import { ExperienceTab } from "./_components/ExperienceTab";
import { IconPlus } from "./_components/icons";

export default function DocStorePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"docs" | "exp">("docs");

  const docs = useDocuments();
  const exp = useExperiences();
  const popup = useCardPopup();
  const ai = useAiSuggest();

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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F4F5F7]">
      {/* Topbar */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-slate-200/60 shrink-0">
        <div className="flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-slate-500">
            <path d="M3 2H13C13.55 2 14 2.45 14 3V13C14 13.55 13.55 14 13 14H3C2.45 14 2 13.55 2 13V3C2 2.45 2.45 2 3 2Z" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 6H11M5 9H9M5 12H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-bold text-slate-800">문서 저장</span>
        </div>
        <div className="flex-1" />
        {tab === "exp" && (
          <button
            onClick={exp.openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <IconPlus /> 경험 추가
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 pt-3 pb-0 bg-white border-b border-slate-200/60 shrink-0">
        <button
          onClick={() => setTab("docs")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
            tab === "docs" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
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
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
            tab === "exp" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          경험
          {exp.experiences.length > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === "exp" ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
              {exp.experiences.length}
            </span>
          )}
        </button>
      </div>

      {tab === "docs" && (
        <DocsTab
          docsLoading={docs.docsLoading}
          filteredDocs={docs.filteredDocs}
          docSearch={docs.docSearch}
          setDocSearch={docs.setDocSearch}
          activePopup={popup.activePopup}
          onCardClick={(doc, el) => {
            if (popup.activePopup?.data.id === doc.id) { popup.closePopup(); return; }
            popup.openPopup("doc", doc, el);
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

      {popup.activePopup && (
        <CardPopup
          activePopup={popup.activePopup}
          popupVisible={popup.popupVisible}
          aiSuggestions={ai.aiSuggestions}
          suggestingIds={ai.suggestingIds}
          onClose={popup.closePopup}
          onDocOpen={(id) => { popup.closePopup(); router.push(`/doc-write?docId=${id}`); }}
          onDocDelete={handleDocDelete}
          onExpEdit={handleExpEdit}
          onExpDelete={handleExpDelete}
          onSuggestOne={ai.handleSuggestOne}
        />
      )}
    </div>
  );
}
