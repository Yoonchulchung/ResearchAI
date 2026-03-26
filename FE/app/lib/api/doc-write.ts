import { apiFetch } from "./base";

export interface DocWriteAction {
  key: string;
  label: string;
  skipCompanyCtx?: boolean;
}

export function enqueueDocWriteAssist(
  action: string,
  content: string,
  model: string,
  experiences?: { title: string; content: string }[],
  companyCtx?: string,
): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>("/documents/write-assist", {
    method: "POST",
    body: JSON.stringify({ action, content, model, experiences, companyCtx }),
  });
}
