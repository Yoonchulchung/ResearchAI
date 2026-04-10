import { MediaType, MimeType } from "@/types";

export const ACCEPT_IMAGE = [MimeType.JPEG, MimeType.JPG, MimeType.PNG];
export const ACCEPT_DOC = [MimeType.PDF, MimeType.DOCX, MimeType.DOC];
export const ACCEPT_ALL = [...ACCEPT_IMAGE, ...ACCEPT_DOC];

export interface AttachedFile {
  id: string;
  file: File;
  mimetype: string;
  parsed?: {
    fileId?: string;
    type: MediaType;
    text?: string;
    pageCount?: number;
    dataUrl?: string;
    size: number;
  };
  uploading: boolean;
  error?: string;
}
