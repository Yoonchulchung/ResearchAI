import { tokenStore, API_BASE, BE_BASE, apiFetch } from "./base";

export interface BgImage {
  id: string;
  filename: string;
  url: string;
}

export function bgImageCss(img: BgImage): string {
  return `url("${BE_BASE}${img.url}") center/cover no-repeat`;
}

function authHeaders(): Record<string, string> {
  const token = tokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listBgImages(): Promise<BgImage[]> {
  return apiFetch<BgImage[]>("/backgrounds", { headers: authHeaders() });
}

export async function uploadBgImage(file: File): Promise<BgImage> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/backgrounds`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error("업로드 실패");
  const data = await res.json();
  const envelope = data as { isSuccess?: unknown; result?: unknown };
  if (envelope.isSuccess === true && Object.prototype.hasOwnProperty.call(envelope, "result")) {
    return envelope.result as BgImage;
  }
  return data as BgImage;
}

export async function deleteBgImage(id: string): Promise<void> {
  await fetch(`${API_BASE}/backgrounds/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}
