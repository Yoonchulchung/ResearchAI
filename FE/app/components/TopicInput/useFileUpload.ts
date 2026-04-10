import { useRef, useEffect, useState } from "react";
import { MimeType } from "@/types";
import { AttachedFile, ACCEPT_ALL } from "./types";

export function useFileUpload(
  attachedFiles: AttachedFile[] | undefined,
  onAttachedFilesChange: ((files: AttachedFile[]) => void) | undefined,
) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // functional updater 대신 ref로 최신 목록 추적
  const filesRef = useRef<AttachedFile[]>(attachedFiles ?? []);
  useEffect(() => {
    filesRef.current = attachedFiles ?? [];
  }, [attachedFiles]);

  const uploadToServer = async (file: File): Promise<AttachedFile["parsed"]> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("http://localhost:3001/api/media/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "업로드 실패");
    }
    const data = await res.json();
    return {
      fileId: data.fileId,
      type: data.type,
      text: data.text,
      pageCount: data.pageCount,
      dataUrl: data.dataUrl,
      size: data.size,
    };
  };

  const handleFilesSelected = async (files: File[]) => {
    if (!onAttachedFilesChange) return;

    const newEntries: AttachedFile[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      mimetype: f.type,
      uploading: true,
    }));

    onAttachedFilesChange([...(attachedFiles ?? []), ...newEntries]);

    for (const entry of newEntries) {
      try {
        const parsed = await uploadToServer(entry.file);
        onAttachedFilesChange(
          filesRef.current.map((e) => (e.id === entry.id ? { ...e, parsed, uploading: false } : e)),
        );
      } catch (err) {
        onAttachedFilesChange(
          filesRef.current.map((e) =>
            e.id === entry.id ? { ...e, uploading: false, error: (err as Error).message } : e,
          ),
        );
      }
    }
  };

  const removeFile = (id: string) => {
    onAttachedFilesChange?.((attachedFiles ?? []).filter((f) => f.id !== id));
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.some((t) => t === "Files")) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ACCEPT_ALL.includes(f.type as MimeType),
    );
    if (files.length > 0) handleFilesSelected(files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files = items
      .filter((item) => item.kind === "file" && ACCEPT_ALL.includes(item.type as MimeType))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      handleFilesSelected(files);
    }
  };

  return {
    isDragOver,
    handleFilesSelected,
    removeFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
  };
}
