// client-side navigation 중 File 객체를 메모리에 보관
// router.push() 이후에도 브라우저 모듈 범위는 유지되므로 안전하게 전달 가능

let _file: File | null = null;
const DB_NAME = "research-ai-doc-parse-cache";
const DB_VERSION = 1;
const STORE_NAME = "pdf-files";
const CURRENT_FILE_KEY = "current";

interface CachedPdfRecord {
  id: string;
  file: File | Blob;
  name: string;
  type: string;
  updatedAt: number;
}

export const pdfFileCache = {
  set(file: File) { _file = file; },
  get(): File | null { return _file; },
  consume(): File | null { const f = _file; _file = null; return f; },
};

function openPdfCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

export async function savePdfDraftFile(file: File): Promise<void> {
  const db = await openPdfCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: CachedPdfRecord = {
      id: CURRENT_FILE_KEY,
      file,
      name: file.name,
      type: file.type || "application/pdf",
      updatedAt: Date.now(),
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save PDF draft file."));
  });
  db.close();
}

export async function loadPdfDraftFile(): Promise<File | null> {
  const db = await openPdfCacheDb();
  const record = await new Promise<CachedPdfRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(CURRENT_FILE_KEY);
    request.onsuccess = () => resolve(request.result as CachedPdfRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Failed to load PDF draft file."));
  });
  db.close();

  if (!record?.file) return null;
  if (record.file instanceof File) return record.file;
  return new File([record.file], record.name || "document.pdf", {
    type: record.type || record.file.type || "application/pdf",
  });
}

export async function clearPdfDraftFile(): Promise<void> {
  const db = await openPdfCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(CURRENT_FILE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear PDF draft file."));
  });
  db.close();
}

/** data URL → blob URL 변환 (sessionStorage 복원 후 react-pdf 호환용) */
export async function dataUrlToBlobUrl(dataUrl: string): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
