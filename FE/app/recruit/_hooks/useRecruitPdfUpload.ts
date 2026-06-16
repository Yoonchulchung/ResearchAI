import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, getAuthHeaders } from "@/lib/api/base";
import { pdfFileCache } from "@/lib/cache/pdfFileCache";
import { createId } from "@/lib/crypto";

function readPdfDataUrl(file: File) {
  if (file.size >= 10 * 1024 * 1024) return Promise.resolve(null);

  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function createUploadFormData(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

export function useRecruitPdfUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handlePdfFile = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;

    pdfFileCache.set(file);
    setUploading(true);
    try {
      const [formRes, pdfDataUrl] = await Promise.all([
        fetch(`${API_BASE}/doc-parse/upload`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: createUploadFormData(file),
        }),
        readPdfDataUrl(file),
      ]);
      const raw = await formRes.json();
      const data = raw?.isSuccess === true && "result" in raw ? raw.result : raw;
      const draft = {
        docText: data.text ?? "",
        docPages: Array.isArray(data.pages) ? data.pages : [],
        filename: file.name,
        pageCount: data.pageCount ?? 1,
        isReady: true,
        messages: [{
          id: createId(),
          role: "assistant" as const,
          content: data.text
            ? `**${file.name}** 파일이 업로드되었습니다. (${data.pageCount}페이지)\n\n질문하거나 빠른 실행 버튼을 사용해보세요.`
            : `**${file.name}** 파일이 업로드되었습니다.\n\n텍스트를 추출하지 못했습니다. 스캔된 이미지 PDF이거나 암호화된 파일일 수 있습니다.`,
        }],
        selectedModel: "",
        pdfDataUrl,
      };

      try {
        sessionStorage.setItem("doc-parse-draft", JSON.stringify(draft));
      } catch {
        sessionStorage.setItem("doc-parse-draft", JSON.stringify({ ...draft, pdfDataUrl: null }));
      }
      router.push("/recruit/doc-parse");
    } catch {
      setUploading(false);
    }
  };

  const openFilePicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handlePdfFile(file);
  };

  return {
    dragOver,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePdfFile,
    inputRef,
    openFilePicker,
    uploading,
  };
}
