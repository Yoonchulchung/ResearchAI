import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createDocument, getDocument, updateDocument } from "@/lib/api/documents";

export function useDocSave(setContent: Dispatch<SetStateAction<string>>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [savedDocTitle, setSavedDocTitle] = useState("");
  const [saveModal, setSaveModal] = useState(false);
  const [saveTitleInput, setSaveTitleInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // URL param으로 저장된 문서 불러오기
  useEffect(() => {
    const docId = searchParams.get("docId");
    if (!docId) return;
    getDocument(docId)
      .then((doc) => {
        setContent(doc.content);
        setSavedDocId(doc.id);
        setSavedDocTitle(doc.title);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (content: string, title?: string) => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      if (savedDocId) {
        await updateDocument(savedDocId, { content, title: title ?? savedDocTitle });
        if (title) setSavedDocTitle(title);
      } else {
        const t = (title ?? saveTitleInput.trim()) || "제목 없음";
        const doc = await createDocument(t, content);
        setSavedDocId(doc.id);
        setSavedDocTitle(doc.title);
        router.replace(`/doc-write?docId=${doc.id}`);
      }
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
    saveModal,
    setSaveModal,
    saveTitleInput,
    setSaveTitleInput,
    saving,
    saveSuccess,
    handleSave,
  };
}
