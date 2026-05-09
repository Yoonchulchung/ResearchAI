import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createDocument, getDocument, updateDocument } from "@/lib/api/documents";

export function useDocSave(
  setContent: Dispatch<SetStateAction<string>>,
  setCompanyName: Dispatch<SetStateAction<string>>,
) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [savedDocTitle, setSavedDocTitle] = useState("");
  const [saveModal, setSaveModal] = useState(false);
  const [saveTitleInput, setSaveTitleInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const docId = searchParams.get("docId");

  // URL param으로 저장된 문서 불러오기 (docId 변경 시 재실행)
  useEffect(() => {
    if (!docId) {
      setSavedDocId(null);
      setSavedDocTitle("");
      setCompanyName("");
      return;
    }
    getDocument(docId)
      .then((doc) => {
        setContent(doc.content);
        setSavedDocId(doc.id);
        setSavedDocTitle(doc.title);
        setCompanyName(doc.companyName ?? "");
      })
      .catch(() => {});
   
  }, [docId]);

  const handleSave = async (content: string, companyName: string, title?: string) => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      if (savedDocId) {
        await updateDocument(savedDocId, { content, title: title ?? savedDocTitle, companyName });
        if (title) setSavedDocTitle(title);
      } else {
        const t = (title ?? savedDocTitle.trim()) || "제목 없음";
        const doc = await createDocument(t, content, companyName);
        setSavedDocId(doc.id);
        setSavedDocTitle(doc.title);
        router.replace(`/doc-write?docId=${doc.id}`);
      }
      localStorage.removeItem("doc-write-draft");
      setSaveSuccess(true);
      setSaveModal(false);
      setSaveTitleInput("");
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return {
    savedDocId,
    savedDocTitle,
    setSavedDocTitle,
    saveModal,
    setSaveModal,
    saveTitleInput,
    setSaveTitleInput,
    saving,
    saveSuccess,
    handleSave,
  };
}
