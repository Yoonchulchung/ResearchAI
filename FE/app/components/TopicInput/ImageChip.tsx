"use client";

import { useState, useEffect } from "react";
import { AttachedFile } from "./types";

export function ImageChip({ af, onRemove }: { af: AttachedFile; onRemove: () => void }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    const url = URL.createObjectURL(af.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [af.file]);

  return (
    <div className="relative group w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-slate-200">
      {src && <img src={src} alt={af.file.name} className="w-full h-full object-cover" />}
      {af.uploading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <span className="animate-spin text-white text-sm">◌</span>
        </div>
      )}
      {af.error && (
        <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center">
          <span className="text-white text-xs">⚠</span>
        </div>
      )}
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 hover:bg-black/70 text-white rounded-full text-micro flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}
