import { apiFetch } from "./base";

export interface Experience {
  id: string;
  title: string;
  content: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceSearchResult {
  id: string;
  title: string;
  content: string;
  category?: string;
  score: number;
}

export function getExperiences(): Promise<Experience[]> {
  return apiFetch<Experience[]>("/experiences");
}

export function createExperience(data: { title: string; content: string; category?: string }): Promise<Experience> {
  return apiFetch<Experience>("/experiences", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateExperience(id: string, data: { title?: string; content?: string; category?: string }): Promise<Experience> {
  return apiFetch<Experience>(`/experiences/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteExperience(id: string): Promise<void> {
  return apiFetch<void>(`/experiences/${id}`, { method: "DELETE" });
}

export function searchExperiences(query: string, topK = 5): Promise<ExperienceSearchResult[]> {
  return apiFetch<ExperienceSearchResult[]>("/experiences/search", {
    method: "POST",
    body: JSON.stringify({ query, topK }),
  });
}

export function suggestCategories(id: string, model: string): Promise<{ categories: string[] }> {
  return apiFetch<{ categories: string[] }>(`/experiences/${id}/suggest-categories`, {
    method: "POST",
    body: JSON.stringify({ model }),
  });
}
