import { apiFetch } from "./base";

export const getConfig = () =>
  apiFetch<Record<string, string>>("/config");

export const setConfig = (key: string, value: string) =>
  apiFetch<{ key: string; value: string }>(`/config/${key}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
