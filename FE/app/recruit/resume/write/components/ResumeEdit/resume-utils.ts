import type {
  ResumeExperience,
  ResumePrize,
  ResumeTarget,
  ResumeTraining,
} from "@/lib/api/resume";
import { API_BASE, getAuthHeaders } from "@/lib/api/base";

export function uid() {
  return Math.random().toString(36).slice(2);
}

export function createResumeTarget(): ResumeTarget {
  return {
    id: uid(),
    companyName: "",
    jobTitle: "",
    appliedAt: "",
    jd: "",
    selfIntroductions: [],
    experiences: [],
    prizes: [],
    trainings: [],
  };
}

export function createResumeExperience(activityType = ""): ResumeExperience {
  return {
    id: uid(),
    activityType,
    organizationName: "",
    startDate: "",
    endDate: "",
    role: "",
    description: "",
  };
}

export function createResumePrize(): ResumePrize {
  return {
    id: uid(),
    title: "",
    organization: "",
    issuedDate: "",
    description: "",
  };
}

export function createResumeTraining(): ResumeTraining {
  return {
    id: uid(),
    title: "",
    institution: "",
    startDate: "",
    endDate: "",
    hours: "",
    description: "",
  };
}

export async function extractJdTextFromImage(
  file: File,
  model: string,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);

  const enqueueRes = await fetch(`${API_BASE}/queue/image-ocr/enqueue`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  const enqueueRaw = await enqueueRes.json().catch(() => ({}));
  const enqueueData =
    enqueueRaw?.isSuccess === true && "result" in enqueueRaw
      ? enqueueRaw.result
      : enqueueRaw;
  if (!enqueueRes.ok) {
    throw new Error(
      typeof enqueueData?.message === "string"
        ? enqueueData.message
        : "이미지 OCR 요청에 실패했습니다.",
    );
  }
  const { jobId } = enqueueData as { jobId: string };

  return new Promise<string>((resolve, reject) => {
    const headers = getAuthHeaders() as Record<string, string>;
    const ctrl = new AbortController();
    let fullText = "";

    fetch(`${API_BASE}/queue/image-ocr/${jobId}/stream`, {
      headers,
      signal: ctrl.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) throw new Error("SSE 연결 실패");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const event = JSON.parse(line.slice(5).trim()) as {
                type: string;
                text?: string;
                message?: string;
              };
              if (event.type === "chunk" && event.text) {
                fullText += event.text;
              } else if (event.type === "done") {
                ctrl.abort();
                resolve(fullText.trim());
                return;
              } else if (event.type === "error") {
                ctrl.abort();
                reject(new Error(event.message ?? "OCR 오류"));
                return;
              }
            } catch {
              // Ignore malformed SSE chunks.
            }
          }
        }
        resolve(fullText.trim());
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") reject(error);
      });
  });
}
