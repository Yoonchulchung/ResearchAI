"use client";

import { useLayoutEffect, useRef, type ClipboardEvent } from "react";
import { IconEvaluate } from "../../../../_components/icons";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-5 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
      {children}
    </h2>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

export function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path
          d="M1.5 1.5l8 8M9.5 1.5l-8 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center text-slate-300 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function SpellcheckButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
    >
      맞춤법
    </button>
  );
}

export function TextEvaluateButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-2.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <IconEvaluate />글 평가
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows,
  onPaste,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs font-bold text-slate-600">{label}</span>
      )}
      {multiline ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 5}
          onPaste={onPaste}
          className="resize-y rounded-md border border-slate-300 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          onPaste={onPaste}
          className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
      )}
    </div>
  );
}

export function InlineField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_minmax(0,1fr)] md:items-start">
      <label className="pt-3 text-sm font-bold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

export function BlockField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 xl:col-span-2">
      <label className="text-sm font-bold text-slate-700">{label}</label>
      {children}
    </div>
  );
}
