import { apiFetch } from "./base";

export interface SavedDocument {
  id: string;
  title: string;
  companyName: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function getDocuments(): Promise<SavedDocument[]> {
  return apiFetch<SavedDocument[]>("/documents");
}

export function getDocument(id: string): Promise<SavedDocument> {
  return apiFetch<SavedDocument>(`/documents/${id}`);
}

export function createDocument(title: string, content: string, companyName?: string): Promise<SavedDocument> {
  return apiFetch<SavedDocument>("/documents", {
    method: "POST",
    body: JSON.stringify({ title, content, companyName }),
  });
}

export function updateDocument(id: string, data: { title?: string; content?: string; companyName?: string }): Promise<SavedDocument> {
  return apiFetch<SavedDocument>(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteDocument(id: string): Promise<void> {
  return apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
}
