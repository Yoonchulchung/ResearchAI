import { useEffect, useState } from "react";
import { SavedDocument, deleteDocument, getDocuments } from "@/lib/api/documents";

export function useDocuments() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docSearch, setDocSearch] = useState("");

  useEffect(() => {
    getDocuments().then(setDocuments).finally(() => setDocsLoading(false));
  }, []);

  const handleDocDelete = async (id: string) => {
    await deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const filteredDocs = documents.filter(
    (d) =>
      !docSearch ||
      d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
      d.content.toLowerCase().includes(docSearch.toLowerCase()),
  );

  return { documents, docsLoading, docSearch, setDocSearch, filteredDocs, handleDocDelete };
}
