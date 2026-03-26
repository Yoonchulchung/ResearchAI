const BE_BASE = "http://localhost:3001";
const API_BASE = `${BE_BASE}/api`;

export interface BgImage {
  id: string;
  filename: string;
  url: string; // e.g. "/backgrounds/uuid.jpg"
}

export function bgImageCss(img: BgImage): string {
  return `url("${BE_BASE}${img.url}") center/cover no-repeat`;
}

export async function listBgImages(): Promise<BgImage[]> {
  const res = await fetch(`${API_BASE}/backgrounds`);
  if (!res.ok) throw new Error("배경 이미지 목록 조회 실패");
  return res.json();
}

export async function uploadBgImage(file: File): Promise<BgImage> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/backgrounds`, { method: "POST", body: form });
  if (!res.ok) throw new Error("업로드 실패");
  return res.json();
}

export async function deleteBgImage(id: string): Promise<void> {
  await fetch(`${API_BASE}/backgrounds/${id}`, { method: "DELETE" });
}
