"use client";

import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfDocumentRendererProps {
  file: string;
  scale: number;
  numPages: number;
  onLoadSuccess: (numPages: number) => void;
}

export function PdfDocumentRenderer({
  file,
  scale,
  numPages,
  onLoadSuccess,
}: PdfDocumentRendererProps) {
  return (
    <Document
      file={file}
      loading={<div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">PDF를 렌더링하고 있습니다.</div>}
      error={<div className="rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-600">PDF를 렌더링하지 못했습니다.</div>}
      onLoadSuccess={({ numPages: nextNumPages }) => onLoadSuccess(nextNumPages)}
      className="space-y-4"
    >
      {Array.from({ length: numPages }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200">
          <Page
            pageNumber={index + 1}
            scale={scale}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            loading={<div className="p-6 text-sm text-slate-400">{index + 1}페이지 렌더링 중</div>}
          />
        </div>
      ))}
    </Document>
  );
}
